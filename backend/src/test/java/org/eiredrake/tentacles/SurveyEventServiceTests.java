package org.eiredrake.tentacles;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import org.eiredrake.tentacles.repository.SurveyNotificationPreferenceRepository;
import org.eiredrake.tentacles.service.SurveyEventService;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SurveyEventServiceTests {
  @Test void disconnectedClientDoesNotInterruptOtherClients() throws Exception {
    failedClientIsRemoved(new IOException("Browser disconnected"));
  }

  @Test void closedAsyncContextIsNotCompletedAgain() throws Exception {
    failedClientIsRemoved(new IllegalStateException("Async context already closed"));
  }

  private void failedClientIsRemoved(Exception failure) throws Exception {
    var service = new SurveyEventService(mock(SurveyNotificationPreferenceRepository.class));
    try (var construction = mockConstruction(SseEmitter.class)) {
      SseEmitter failed = service.subscribe(1L, null);
      SseEmitter healthy = service.subscribe(1L, null);
      clearInvocations(failed, healthy);
      doThrow(failure).when(failed).send(any(SseEmitter.SseEventBuilder.class));
      ExecutorService delivery = (ExecutorService) ReflectionTestUtils.getField(service, "delivery");
      for (int i = 0; i < 2; i++) {
        ReflectionTestUtils.invokeMethod(service, "heartbeat");
        delivery.submit(() -> {}).get(3, TimeUnit.SECONDS);
      }
      verify(failed).send(any(SseEmitter.SseEventBuilder.class));
      verify(failed, never()).completeWithError(any());
      verify(failed, never()).complete();
      verify(healthy, times(2)).send(any(SseEmitter.SseEventBuilder.class));
    } finally {
      service.close();
    }
  }
}
