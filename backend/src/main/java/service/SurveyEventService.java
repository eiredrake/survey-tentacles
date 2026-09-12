package org.eiredrake.tentacles.service;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.*;
import org.eiredrake.tentacles.event.SurveyAdminEvent;
import org.eiredrake.tentacles.repository.SurveyNotificationPreferenceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class SurveyEventService {
  private static final Logger log = LoggerFactory.getLogger(SurveyEventService.class);
  private final Map<Long, Set<SseEmitter>> subscribers = new ConcurrentHashMap<>();
  private record Delivery(long sequence, SurveyAdminEvent event) {}
  private final Map<String, Delivery> recentEvents = new LinkedHashMap<>();
  private final String instanceId = UUID.randomUUID().toString();
  private long sequence;
  private final ThreadPoolExecutor delivery = new ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(256), Thread.ofPlatform().daemon().name("survey-events-", 0).factory());
  private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(
    Thread.ofPlatform().daemon().name("survey-events-heartbeat").factory());

  private final SurveyNotificationPreferenceRepository preferences;

  public SurveyEventService(SurveyNotificationPreferenceRepository preferences) {
    this.preferences = preferences;
    heartbeat.scheduleAtFixedRate(this::heartbeat, 15, 15, TimeUnit.SECONDS);
  }

  public SseEmitter subscribe(Long userId, String lastEventId) {
    // Short-lived streams reconnect automatically and re-check the admin's authorization.
    SseEmitter emitter = new SseEmitter(60_000L);
    Map<Long, Instant> enabledSurveys = new HashMap<>();
    preferences.findSubscriptions(userId).forEach(p -> enabledSurveys.put(p.getSurveyId(), p.getEnabledAt()));
    synchronized (recentEvents) {
      subscribers.compute(userId, (id, clients) -> {
        if (clients == null) clients = ConcurrentHashMap.newKeySet();
        clients.add(emitter);
        return clients;
      });
      emitter.onCompletion(() -> remove(userId, emitter));
      emitter.onTimeout(() -> { remove(userId, emitter); emitter.complete(); });
      emitter.onError(error -> remove(userId, emitter));
      long lastSequence = sequence;
      if (lastEventId != null && lastEventId.startsWith(instanceId + ":")) {
        try { lastSequence = Long.parseLong(lastEventId.substring(instanceId.length() + 1)); }
        catch (NumberFormatException ignored) { /* Unknown cursor starts with current events. */ }
      }
      for (Delivery item : recentEvents.values()) {
        Instant enabledAt = enabledSurveys.get(item.event().surveyId());
        if (item.sequence() > lastSequence && enabledAt != null && !item.event().occurredAt().isBefore(enabledAt)) {
          send(userId, emitter, message(item));
        }
      }
      send(userId, emitter, SseEmitter.event().id(instanceId + ":" + sequence).name("ready").reconnectTime(3000).data("connected"));
    }
    return emitter;
  }

  @TransactionalEventListener
  public void afterSubmission(SurveyAdminEvent event) {
    Delivery item;
    synchronized (recentEvents) {
      if (recentEvents.containsKey(event.id())) return;
      item = new Delivery(++sequence, event);
      recentEvents.put(event.id(), item);
      if (recentEvents.size() > 10_000) recentEvents.remove(recentEvents.keySet().iterator().next());
      // Capture connections now: a later subscriber receives replay before its ready cursor.
      Map<Long, Set<SseEmitter>> clients = new HashMap<>();
      subscribers.forEach((userId, emitters) -> clients.put(userId, Set.copyOf(emitters)));
      if (clients.isEmpty()) return;
      enqueue(() -> {
        for (Long userId : preferences.findRecipients(event.surveyId(), event.occurredAt())) {
          for (SseEmitter emitter : clients.getOrDefault(userId, Set.of())) {
            send(userId, emitter, message(item));
          }
        }
      });
    }
  }

  private SseEmitter.SseEventBuilder message(Delivery item) {
    return SseEmitter.event().id(instanceId + ":" + item.sequence()).name("survey-event").data(item.event());
  }

  private void heartbeat() {
    if (subscribers.isEmpty()) return;
    enqueue(() -> subscribers.forEach((userId, clients) -> {
      for (SseEmitter emitter : clients) send(userId, emitter, SseEmitter.event().comment("keep-alive"));
    }));
  }

  private void enqueue(Runnable task) {
    try {
      delivery.execute(task);
    } catch (RejectedExecutionException error) {
      // A slow/disconnected admin must never cause a successful participant save to fail.
      log.warn("Survey live notification queue is unavailable.");
    }
  }

  private void send(Long userId, SseEmitter emitter, SseEmitter.SseEventBuilder event) {
    try {
      emitter.send(event);
    } catch (IOException | IllegalStateException error) {
      remove(userId, emitter);
      emitter.completeWithError(error);
    }
  }

  private void remove(Long userId, SseEmitter emitter) {
    subscribers.computeIfPresent(userId, (id, clients) -> {
      clients.remove(emitter);
      return clients.isEmpty() ? null : clients;
    });
  }

  @PreDestroy
  public void close() {
    heartbeat.shutdownNow();
    delivery.shutdownNow();
    subscribers.values().forEach(clients -> clients.forEach(SseEmitter::complete));
    subscribers.clear();
  }
}
