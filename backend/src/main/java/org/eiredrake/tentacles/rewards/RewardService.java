package org.eiredrake.tentacles.rewards;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.util.*;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.service.QuestionCompletionService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
@Transactional
public class RewardService {
  private final EntityManager em;
  private final QuestionCompletionService completion;
  public RewardService(EntityManager em, QuestionCompletionService completion) {
    this.em = em; this.completion = completion;
  }

  public record Settings(boolean enabled, String pointName) {}
  public record QuestionPoints(Long id, String prompt, int points) {}
  public record SurveyConfig(boolean available, String pointName, boolean enabled, List<QuestionPoints> questions) {}
  public record PerkInput(String name, String description, BigDecimal cost, boolean active) {}
  public record Perk(Long id, String name, String description, int cost, boolean active) {}
  public record Entry(Long id, Long userId, String userName, String kind, long amount, String description,
    java.time.Instant occurredAt, Long surveyId, Long questionId, Long perkId) {}
  public record Leader(Long userId, String name, long earned) {}
  public record Account(Settings settings, long balance, List<Entry> history, List<Perk> perks, List<Leader> leaderboard) {}

  public Settings settings() {
    var settings = em.find(RewardSettings.class, 1L);
    return settings == null ? new Settings(false, "Points") : new Settings(settings.enabled, settings.pointName);
  }

  public Settings saveSettings(Settings input) {
    String name = text(input.pointName(), "Point name", 80, false);
    var settings = em.find(RewardSettings.class, 1L, LockModeType.PESSIMISTIC_WRITE);
    if (settings == null) { settings = new RewardSettings(); em.persist(settings); }
    settings.enabled = input.enabled(); settings.pointName = name;
    return settings();
  }

  public SurveyConfig surveyConfig(Survey survey) {
    var global = settings();
    var config = em.find(SurveyRewards.class, survey.getId());
    return new SurveyConfig(global.enabled(), global.pointName(), config != null && config.enabled,
      survey.getQuestions().stream().map(q -> new QuestionPoints(q.getId(), q.getPrompt(),
        config == null ? 0 : config.questionPoints.getOrDefault(q.getId(), 0))).toList());
  }

  public SurveyConfig saveSurvey(Survey survey, boolean enabled, Map<Long, BigDecimal> values) {
    requireEnabled();
    if (values == null) throw bad("Question point values are required.");
    Set<Long> ids = new HashSet<>(); survey.getQuestions().forEach(q -> ids.add(q.getId()));
    if (!ids.equals(values.keySet())) throw bad("Questions changed. Reload the rewards settings before saving.");
    Map<Long, Integer> points = new HashMap<>();
    values.forEach((id, amount) -> points.put(id, integer(amount, "Question points", 0)));
    var config = em.find(SurveyRewards.class, survey.getId(), LockModeType.PESSIMISTIC_WRITE);
    if (config == null) { config = new SurveyRewards(); config.surveyId = survey.getId(); em.persist(config); }
    config.enabled = enabled; config.questionPoints.clear(); config.questionPoints.putAll(points);
    return surveyConfig(survey);
  }

  /** Called only by successful submission finalization, in its transaction. */
  public void award(Survey survey, User user) {
    // Serialize this participant's earning and spending; the balance remains a ledger sum.
    em.find(User.class, user.getId(), LockModeType.PESSIMISTIC_WRITE);
    var settings = em.find(RewardSettings.class, 1L, LockModeType.PESSIMISTIC_READ);
    if (settings == null || !settings.enabled) return;
    var config = em.find(SurveyRewards.class, survey.getId(), LockModeType.PESSIMISTIC_READ);
    if (config == null || !config.enabled) return;
    for (Question question : survey.getQuestions()) {
      int points = config.questionPoints.getOrDefault(question.getId(), 0);
      String key = "question:" + question.getId();
      if (points <= 0 || findOperation(user.getId(), key) != null || !completion.hasAnswered(question, user)) continue;
      var entry = entry(user, key, "EARNED", points, survey.getTitle() + " — " + question.getPrompt());
      entry.surveyId = survey.getId(); entry.questionId = question.getId(); em.persist(entry);
    }
  }

  public List<Perk> perks(boolean includeInactive) {
    return em.createQuery("select p from RewardPerk p " + (includeInactive ? "" : "where p.active = true ") + "order by p.cost, p.id", RewardPerk.class)
      .getResultList().stream().map(this::perk).toList();
  }

  public Perk savePerk(Long id, PerkInput input) {
    String name = text(input.name(), "Perk name", 120, false);
    String description = text(input.description(), "Description", 1000, true);
    int cost = integer(input.cost(), "Cost", 1);
    var value = id == null ? new RewardPerk() : em.find(RewardPerk.class, id, LockModeType.PESSIMISTIC_WRITE);
    if (value == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Perk not found.");
    value.name = name; value.description = description; value.cost = cost; value.active = input.active();
    if (id == null) em.persist(value);
    return perk(value);
  }

  public Entry redeem(User user, Long perkId, UUID requestId) {
    if (perkId == null || requestId == null) throw bad("Perk and redemption request ID are required.");
    em.find(User.class, user.getId(), LockModeType.PESSIMISTIC_WRITE);
    String key = "redemption:" + requestId;
    var existing = findOperation(user.getId(), key);
    if (existing != null) {
      if (!perkId.equals(existing.perkId)) throw bad("This request ID was already used for another perk.");
      return view(existing);
    }
    requireEnabled();
    var perk = em.find(RewardPerk.class, perkId, LockModeType.PESSIMISTIC_READ);
    if (perk == null || !perk.active) throw bad("This perk is no longer available.");
    if (balance(user.getId()) < perk.cost) throw bad("You do not have enough points for this perk.");
    var entry = entry(user, key, "REDEEMED", -((long) perk.cost), perk.name + (perk.description.isBlank() ? "" : " — " + perk.description));
    // The ledger description is a snapshot, even if the perk is later edited or retired.
    entry.description = entry.description.substring(0, Math.min(1000, entry.description.length()));
    entry.perkId = perkId; em.persist(entry);
    return view(entry);
  }

  public Account account(User user) {
    var settings = settings();
    return new Account(settings, balance(user.getId()), history(user.getId()), settings.enabled() ? perks(false) : List.of(),
      settings.enabled() ? leaderboard() : List.of());
  }

  public List<Entry> redemptions() {
    return em.createQuery("select t from RewardTransaction t where t.kind = 'REDEEMED' order by t.id desc", RewardTransaction.class)
      .getResultList().stream().map(this::view).toList();
  }

  private List<Entry> history(Long userId) {
    return em.createQuery("select t from RewardTransaction t where t.userId = :user order by t.id desc", RewardTransaction.class)
      .setParameter("user", userId).getResultList().stream().map(this::view).toList();
  }

  private List<Leader> leaderboard() {
    // Lifetime earned points: spending never reduces a participant's leaderboard score.
    return em.createQuery("select t.userId, coalesce(u.displayName, u.username), sum(t.amount) from RewardTransaction t, User u "
      + "where t.userId = u.id and t.kind = 'EARNED' group by t.userId, u.displayName, u.username order by sum(t.amount) desc, t.userId", Object[].class)
      .getResultList().stream().map(row -> new Leader((Long) row[0], (String) row[1], (Long) row[2])).toList();
  }

  private long balance(Long userId) {
    return em.createQuery("select coalesce(sum(t.amount), 0) from RewardTransaction t where t.userId = :user", Long.class)
      .setParameter("user", userId).getSingleResult();
  }

  private RewardTransaction findOperation(Long userId, String key) {
    return em.createQuery("select t from RewardTransaction t where t.userId = :user and t.operationKey = :key", RewardTransaction.class)
      .setParameter("user", userId).setParameter("key", key).getResultStream().findFirst().orElse(null);
  }

  private void requireEnabled() {
    var settings = em.find(RewardSettings.class, 1L, LockModeType.PESSIMISTIC_READ);
    if (settings == null || !settings.enabled) throw bad("Participation rewards are disabled.");
  }
  private RewardTransaction entry(User user, String key, String kind, long amount, String description) {
    var value = new RewardTransaction(); value.userId = user.getId(); value.operationKey = key;
    value.userName = user.getDisplayName() == null || user.getDisplayName().isBlank() ? user.getUsername() : user.getDisplayName();
    value.kind = kind; value.amount = amount; value.description = description; return value;
  }
  private Perk perk(RewardPerk p) { return new Perk(p.id, p.name, p.description, p.cost, p.active); }
  private Entry view(RewardTransaction t) { return new Entry(t.id, t.userId, t.userName, t.kind, t.amount, t.description, t.occurredAt, t.surveyId, t.questionId, t.perkId); }
  private static int integer(BigDecimal value, String label, int minimum) {
    try { int number = value.intValueExact(); if (number >= minimum) return number; }
    catch (ArithmeticException | NullPointerException ignored) {}
    throw bad(label + " must be a whole number of at least " + minimum + ".");
  }
  private static String text(String value, String label, int maximum, boolean optional) {
    String result = value == null ? "" : value.trim();
    if ((!optional && result.isEmpty()) || result.length() > maximum) throw bad(label + " must contain " + (optional ? "0" : "1") + "–" + maximum + " characters.");
    return result;
  }
  private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
