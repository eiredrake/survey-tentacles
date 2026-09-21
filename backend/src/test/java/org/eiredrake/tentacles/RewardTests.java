package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.rewards.*;
import org.eiredrake.tentacles.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RewardTests {
  @Autowired EntityManager em;
  @Autowired RewardService rewards;
  @Autowired UserService users;
  @Autowired SurveyParticipantService participants;
  @Autowired QuestionCompletionService completion;
  @Autowired PlatformTransactionManager transactions;
  @Autowired MockMvc mvc;
  Survey survey;
  ShortTextQuestion question;
  User voter;
  OidcUser principal;
  TransactionTemplate tx;

  @BeforeEach void setup() {
    tx = new TransactionTemplate(transactions);
    tx.executeWithoutResult(status -> {
      principal = new DefaultOidcUser(List.of(new SimpleGrantedAuthority("ROLE_USER")),
        new OidcIdToken("test", Instant.now(), Instant.now().plusSeconds(3600),
          Map.of("sub", UUID.randomUUID().toString(), "preferred_username", "reward-voter")));
      voter = users.findOrCreate(principal);
      survey = new Survey(); survey.setTitle("Feedback"); survey.setCreator(voter); survey.setStatus(SurveyStatus.OPEN); em.persist(survey);
      question = new ShortTextQuestion(); question.setSurvey(survey); question.setType(QuestionType.SHORT_TEXT);
      question.setPrompt("How was the session?"); question.setDisplayOrder(1); em.persist(question); survey.getQuestions().add(question);
    });
  }
  void enable() {
    rewards.saveSettings(new RewardService.Settings(true, "Karma"));
    rewards.saveSurvey(survey, true, Map.of(question.getId(), BigDecimal.TEN));
  }
  void answer() {
    var answer = new ShortTextAnswer(); answer.setQuestion(question); answer.setUser(voter); answer.setValue("Great!");
    em.persist(answer); question.getAnswers().add(answer);
  }
  RewardService.Perk perk(int cost) {
    return rewards.savePerk(null, new RewardService.PerkInput("Advantage", "One roll", BigDecimal.valueOf(cost), true));
  }
  void submit() throws Exception {
    mvc.perform(post("/api/surveys/{id}/submitted", survey.getId()).with(oidcLogin().oidcUser(principal)).with(csrf())
      .contentType("application/json").content("{\"submissionId\":\"" + UUID.randomUUID() + "\"}")).andExpect(status().isOk());
  }

  @Test void defaultsOffAndRequiresBothGlobalAndSurveyOptIn() {
    answer(); assertFalse(rewards.settings().enabled()); rewards.award(survey, voter);
    assertEquals(0, rewards.account(voter).balance());
    rewards.saveSettings(new RewardService.Settings(true, "Karma")); rewards.award(survey, voter);
    assertEquals(0, rewards.account(voter).balance());
    rewards.saveSurvey(survey, true, Map.of(question.getId(), BigDecimal.TEN)); rewards.award(survey, voter);
    assertEquals(10, rewards.account(voter).balance());
  }
  @Test void onlySuccessfulSubmissionAwardsAndRepeatsNeverEarnTwice() throws Exception {
    enable(); answer(); assertEquals(0, rewards.account(voter).balance());
    mvc.perform(post("/api/surveys/{id}/submitted", survey.getId()).with(oidcLogin().oidcUser(principal)).with(csrf())
      .contentType("application/json").content("{\"submissionId\":\"" + UUID.randomUUID() + "\"}")).andExpect(status().isNotFound());
    assertEquals(0, rewards.account(voter).balance());
    participants.add(survey, voter); submit(); submit();
    rewards.saveSurvey(survey, true, Map.of(question.getId(), BigDecimal.valueOf(100))); submit();
    assertEquals(10, rewards.account(voter).balance()); assertEquals(1, rewards.account(voter).history().size());
  }
  @Test void unansweredQuestionsDoNotEarnAndSurveyDisablePausesAwards() {
    enable(); rewards.award(survey, voter); assertEquals(0, rewards.account(voter).balance());
    answer(); rewards.saveSurvey(survey, false, Map.of(question.getId(), BigDecimal.TEN));
    rewards.award(survey, voter); assertEquals(0, rewards.account(voter).balance());
  }
  @Test void relationshipCommentsPreserveRequiredVersusOptionalCompletion() {
    var relationship = new RelationshipQuestion(); relationship.setSurvey(survey); relationship.setType(QuestionType.RELATIONSHIP);
    relationship.setPrompt("Characters"); relationship.setDisplayOrder(2); em.persist(relationship);
    var subject = new RelationshipSubject(); subject.setQuestion(relationship); subject.setName("George"); em.persist(subject);
    var answer = new RelationshipAnswer(); answer.setQuestion(relationship); answer.setSubject(subject); answer.setUser(voter); answer.setComment("Interesting"); em.persist(answer);
    assertTrue(completion.hasAnswered(relationship, voter));
    relationship.setRequired(true); assertFalse(completion.hasAnswered(relationship, voter));
    answer.setTrustScore(1); assertTrue(completion.hasAnswered(relationship, voter));
  }
  @Test void redemptionIsIdempotentAndRetainsSnapshotsAndLeaderboardScore() {
    enable(); answer(); rewards.award(survey, voter); var perk = perk(7); UUID key = UUID.randomUUID();
    var redeemed = rewards.redeem(voter, perk.id(), key);
    assertEquals(redeemed.id(), rewards.redeem(voter, perk.id(), key).id());
    rewards.savePerk(perk.id(), new RewardService.PerkInput("Renamed", "Changed", BigDecimal.ONE, false));
    var account = rewards.account(voter); assertEquals(3, account.balance()); assertEquals(2, account.history().size());
    assertEquals(10, account.leaderboard().getFirst().earned()); assertTrue(account.perks().isEmpty());
    assertEquals("Advantage — One roll", rewards.redemptions().getFirst().description());
    assertEquals(-7, rewards.redemptions().getFirst().amount());
  }
  @Test void rejectsOverspendingAndDisablingPreservesBalanceAndHistory() {
    enable(); answer(); rewards.award(survey, voter); var expensive = perk(11);
    assertThrows(ResponseStatusException.class, () -> rewards.redeem(voter, expensive.id(), UUID.randomUUID()));
    rewards.saveSettings(new RewardService.Settings(false, "Karma"));
    assertThrows(ResponseStatusException.class, () -> rewards.redeem(voter, perk(1).id(), UUID.randomUUID()));
    assertEquals(10, rewards.account(voter).balance()); assertEquals(1, rewards.account(voter).history().size());
  }
  @Test void sourceDeletionDoesNotEraseLedger() {
    enable(); answer(); rewards.award(survey, voter);
    em.remove(question); survey.getQuestions().clear(); em.remove(survey); em.flush();
    assertEquals(10, rewards.account(voter).balance()); assertEquals("Feedback — How was the session?", rewards.account(voter).history().getFirst().description());
  }
  @Test void rejectsInvalidPointValuesAndStaleQuestionLists() {
    enable();
    assertThrows(ResponseStatusException.class, () -> rewards.saveSurvey(survey, true, Map.of(question.getId(), new BigDecimal("1.5"))));
    assertThrows(ResponseStatusException.class, () -> rewards.saveSurvey(survey, true, Map.of(question.getId(), BigDecimal.valueOf(-1))));
    assertThrows(ResponseStatusException.class, () -> rewards.saveSurvey(survey, true, Map.of(999L, BigDecimal.ONE)));
    assertThrows(ResponseStatusException.class, () -> rewards.savePerk(null, new RewardService.PerkInput("Perk", "", BigDecimal.ZERO, true)));
  }
  @Test void administrationRequiresRoleAndCsrfAndParticipantCannotInspectOthersHistory() throws Exception {
    mvc.perform(put("/api/rewards/admin/settings").with(oidcLogin()).with(csrf()).contentType("application/json")
      .content("{\"enabled\":true,\"pointName\":\"Stars\"}")).andExpect(status().isForbidden());
    mvc.perform(put("/api/rewards/admin/settings").with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
      .contentType("application/json").content("{\"enabled\":true,\"pointName\":\"Stars\"}")).andExpect(status().isForbidden());
    mvc.perform(put("/api/rewards/admin/settings").with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())
      .contentType("application/json").content("{\"enabled\":true,\"pointName\":\"Stars\"}")).andExpect(status().isOk());
    mvc.perform(get("/api/rewards/admin/redemptions").with(oidcLogin())).andExpect(status().isForbidden());
    mvc.perform(get("/api/rewards/account").with(oidcLogin().oidcUser(principal))).andExpect(status().isOk()).andExpect(jsonPath("$.balance").value(0));
  }

  @Test
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  void concurrentAwardsAndRedemptionsCannotDuplicateOrOverspend() throws Exception {
    Long[] perkId = new Long[1];
    try {
      tx.executeWithoutResult(status -> {
        survey = em.find(Survey.class, survey.getId()); question = em.find(ShortTextQuestion.class, question.getId()); voter = em.find(User.class, voter.getId());
        enable(); answer(); perkId[0] = perk(7).id();
      });
      runTogether(() -> tx.execute(status -> { rewards.award(em.find(Survey.class, survey.getId()), em.find(User.class, voter.getId())); return true; }));
      assertEquals(10, rewards.account(voter).balance()); assertEquals(1, rewards.account(voter).history().size());
      var results = runTogether(() -> { try { rewards.redeem(voter, perkId[0], UUID.randomUUID()); return true; } catch (ResponseStatusException insufficient) { return false; } });
      assertEquals(1, results.stream().filter(Boolean::booleanValue).count()); assertEquals(3, rewards.account(voter).balance());
    } finally {
      tx.executeWithoutResult(status -> {
        em.createQuery("delete from RewardTransaction t where t.userId = :user").setParameter("user", voter.getId()).executeUpdate();
        if (perkId[0] != null) em.remove(em.find(RewardPerk.class, perkId[0]));
        var config = em.find(SurveyRewards.class, survey.getId()); if (config != null) em.remove(config);
        em.remove(em.find(Survey.class, survey.getId())); em.remove(em.find(User.class, voter.getId()));
        var settings = em.find(RewardSettings.class, 1L); if (settings != null) em.remove(settings);
      });
    }
  }
  List<Boolean> runTogether(Callable<Boolean> action) throws Exception {
    try (var executor = Executors.newFixedThreadPool(2)) {
      var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
      Callable<Boolean> task = () -> { ready.countDown(); if (!start.await(10, TimeUnit.SECONDS)) throw new TimeoutException(); return action.call(); };
      var first = executor.submit(task); var second = executor.submit(task);
      assertTrue(ready.await(10, TimeUnit.SECONDS)); start.countDown();
      return List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
    }
  }
}
