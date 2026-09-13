package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.repository.ImageAttachmentRepository;
import org.eiredrake.tentacles.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class ImageAttachmentTests {
  static final Path uploads = temporaryDirectory();
  static final byte[] GIF = HexFormat.of().parseHex("47494638396101000100800000000000ffffff"
    + "21ff0b4e45545343415045322e300301000000"
    + "21f904000a0000002c0000000001000100000202440100"
    + "21f904000a0000002c00000000010001000002024c01003b");
  static Path temporaryDirectory() {
    try { return Files.createTempDirectory("tentacles-attachment-tests-"); }
    catch (IOException error) { throw new UncheckedIOException(error); }
  }
  @DynamicPropertySource static void properties(DynamicPropertyRegistry properties) {
    properties.add("tentacles.upload-dir", uploads::toString);
    properties.add("spring.datasource.url", () -> "jdbc:h2:mem:attachments;NON_KEYWORDS=VALUE");
  }
  @Autowired MockMvc mvc;
  @Autowired EntityManager em;
  @Autowired PlatformTransactionManager transactionManager;
  @Autowired ImageAttachmentService service;
  @Autowired ImageAttachmentRepository attachments;
  @Autowired SurveyImageService files;
  @Autowired SurveyService surveys;
  @MockitoBean UserService users;
  TransactionTemplate transaction;
  Long surveyId, questionId, subjectId;
  User user;

  @BeforeEach void setup() {
    transaction = new TransactionTemplate(transactionManager);
    transaction.executeWithoutResult(status -> {
      user = new User();
      user.setOidcSubject(UUID.randomUUID().toString());
      user.setUsername("admin");
      em.persist(user);
      Survey survey = new Survey();
      survey.setTitle("Characters");
      survey.setCreator(user);
      em.persist(survey);
      surveyId = survey.getId();
      RelationshipQuestion question = new RelationshipQuestion();
      question.setSurvey(survey);
      question.setType(QuestionType.RELATIONSHIP);
      question.setPrompt("Relationships");
      question.setDisplayOrder(1);
      RelationshipSubject subject = new RelationshipSubject();
      subject.setQuestion(question);
      subject.setName("Arlo");
      subject.setDisplayOrder(0);
      question.getSubjects().add(subject);
      em.persist(question);
      questionId = question.getId();
      subjectId = subject.getId();
    });
    when(users.findOrCreate(any())).thenReturn(user);
  }

  @AfterEach void cleanup() throws IOException {
    transaction.executeWithoutResult(status -> surveys.findAll().forEach(surveys::delete));
    try (var paths = Files.list(uploads)) { for (Path path : paths.toList()) Files.deleteIfExists(path); }
  }
  @AfterAll static void cleanupDirectory() throws IOException { Files.deleteIfExists(uploads); }
  String url(AttachmentOwner type, Long id) { return "/api/surveys/" + surveyId + "/images/" + type + "/" + id; }
  MockMultipartFile gif() { return new MockMultipartFile("file", "portrait.gif", "image/gif", GIF); }
  ResultActions upload(AttachmentOwner type, Long id) throws Exception {
    return mvc.perform(multipart(url(type, id)).file(gif()).with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf()));
  }
  ImageAttachment image(AttachmentOwner type, Long id) { return attachments.findByOwnerTypeAndOwnerId(type, id).orElseThrow(); }

  @Test void animatedGifRoundTripsWithoutFlatteningAndHasMetadata() throws Exception {
    upload(AttachmentOwner.RELATIONSHIP_SUBJECT, subjectId).andExpect(status().isOk())
      .andExpect(jsonPath("$.contentType").value("image/gif"));
    byte[] bytes = mvc.perform(get(url(AttachmentOwner.RELATIONSHIP_SUBJECT, subjectId)).with(oidcLogin()))
      .andExpect(status().isOk()).andExpect(content().contentType("image/gif"))
      .andExpect(header().string("X-Content-Type-Options", "nosniff")).andReturn().getResponse().getContentAsByteArray();
    assertArrayEquals(GIF, bytes);
    try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      var reader = ImageIO.getImageReadersByFormatName("gif").next();
      try { reader.setInput(input); assertEquals(2, reader.getNumImages(true)); } finally { reader.dispose(); }
    }
    mvc.perform(get("/api/surveys/" + surveyId + "/questions/" + questionId + "/images").with(oidcLogin()))
      .andExpect(status().isOk()).andExpect(jsonPath("$[0].ownerType").value("RELATIONSHIP_SUBJECT"));
  }

  @Test void replacementAndRemovalDeleteOnlyTheOldFileAfterCommit() throws Exception {
    upload(AttachmentOwner.QUESTION, questionId).andExpect(status().isOk());
    Path old = files.getPath(image(AttachmentOwner.QUESTION, questionId).getFilename());
    upload(AttachmentOwner.QUESTION, questionId).andExpect(status().isOk());
    Path current = files.getPath(image(AttachmentOwner.QUESTION, questionId).getFilename());
    assertFalse(Files.exists(old));
    assertTrue(Files.exists(current));
    mvc.perform(delete(url(AttachmentOwner.QUESTION, questionId)).with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf()))
      .andExpect(status().isNoContent());
    assertFalse(Files.exists(current));
    assertTrue(attachments.findByOwnerTypeAndOwnerId(AttachmentOwner.QUESTION, questionId).isEmpty());
  }

  @Test void rollbackPreservesOldImageAndRemovesTheUncommittedUpload() throws Exception {
    upload(AttachmentOwner.QUESTION, questionId).andExpect(status().isOk());
    String old = image(AttachmentOwner.QUESTION, questionId).getFilename();
    transaction.executeWithoutResult(status -> {
      try { service.upload(surveyId, AttachmentOwner.QUESTION, questionId, gif()); }
      catch (IOException error) { throw new UncheckedIOException(error); }
      assertTrue(Files.exists(files.getPath(old)));
      status.setRollbackOnly();
    });
    assertEquals(old, image(AttachmentOwner.QUESTION, questionId).getFilename());
    try (var paths = Files.list(uploads)) { assertEquals(1, paths.count()); }
    transaction.executeWithoutResult(status -> { service.remove(surveyId, AttachmentOwner.QUESTION, questionId); status.setRollbackOnly(); });
    assertTrue(Files.exists(files.getPath(old)));
  }

  @Test void invalidFilesAndForeignOwnersCannotReplaceAnImage() throws Exception {
    upload(AttachmentOwner.QUESTION, questionId).andExpect(status().isOk());
    String old = image(AttachmentOwner.QUESTION, questionId).getFilename();
    for (MockMultipartFile invalid : List.of(
      new MockMultipartFile("file", "fake.gif", "image/gif", "not an image".getBytes()),
      new MockMultipartFile("file", "bad.svg", "image/svg+xml", "<svg/>".getBytes()),
      new MockMultipartFile("file", "large.gif", "image/gif", new byte[5 * 1024 * 1024 + 1]))) {
      mvc.perform(multipart(url(AttachmentOwner.QUESTION, questionId)).file(invalid)
        .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())).andExpect(status().is4xxClientError());
    }
    mvc.perform(multipart("/api/surveys/999999/images/QUESTION/" + questionId).file(gif())
      .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())).andExpect(status().isNotFound());
    assertEquals(old, image(AttachmentOwner.QUESTION, questionId).getFilename());
  }

  @Test void writesRequireAdminAndCsrfAndReadsRequireLogin() throws Exception {
    mvc.perform(multipart(url(AttachmentOwner.QUESTION, questionId)).file(gif()).with(oidcLogin()).with(csrf()))
      .andExpect(status().isForbidden());
    mvc.perform(multipart(url(AttachmentOwner.QUESTION, questionId)).file(gif())
      .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))).andExpect(status().isForbidden());
    mvc.perform(delete(url(AttachmentOwner.QUESTION, questionId)).with(oidcLogin()).with(csrf())).andExpect(status().isForbidden());
    mvc.perform(get(url(AttachmentOwner.QUESTION, questionId))).andExpect(status().is3xxRedirection());
  }

  @Test void portraitChangesPreserveAnswersAndOrdinaryQuestionEditsKeepPortraitIdentity() throws Exception {
    Long answerId = transaction.execute(status -> {
      RelationshipAnswer answer = new RelationshipAnswer();
      answer.setQuestion(em.find(Question.class, questionId));
      answer.setSubject(em.find(RelationshipSubject.class, subjectId));
      answer.setUser(em.find(User.class, user.getId()));
      answer.setLikeScore(3);
      em.persist(answer);
      return answer.getId();
    });
    upload(AttachmentOwner.RELATIONSHIP_SUBJECT, subjectId).andExpect(status().isOk());
    assertNotNull(transaction.execute(status -> em.find(RelationshipAnswer.class, answerId)));
    Path portrait = files.getPath(image(AttachmentOwner.RELATIONSHIP_SUBJECT, subjectId).getFilename());
    mvc.perform(post("/api/surveys/" + surveyId + "/questions/" + questionId + "/relationship")
      .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf()).contentType(MediaType.APPLICATION_JSON)
      .content("{\"prompt\":\"Updated\",\"subjects\":[{\"id\":" + subjectId + ",\"name\":\"Arlo renamed\"}]}"))
      .andExpect(status().isOk());
    assertTrue(Files.exists(portrait));
    assertNotNull(transaction.execute(status -> em.find(RelationshipSubject.class, subjectId)));
    assertNull(transaction.execute(status -> em.find(RelationshipAnswer.class, answerId)));
  }

  @Test void removingSubjectOrQuestionCleansUpAttachments() throws Exception {
    upload(AttachmentOwner.RELATIONSHIP_SUBJECT, subjectId).andExpect(status().isOk());
    Path portrait = files.getPath(image(AttachmentOwner.RELATIONSHIP_SUBJECT, subjectId).getFilename());
    mvc.perform(post("/api/surveys/" + surveyId + "/questions/" + questionId + "/relationship")
      .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf()).contentType(MediaType.APPLICATION_JSON)
      .content("{\"prompt\":\"Updated\",\"subjects\":[{\"name\":\"Someone new\"}]}"))
      .andExpect(status().isOk());
    assertFalse(Files.exists(portrait));
    upload(AttachmentOwner.QUESTION, questionId).andExpect(status().isOk());
    Path questionImage = files.getPath(image(AttachmentOwner.QUESTION, questionId).getFilename());
    mvc.perform(delete("/api/surveys/" + surveyId + "/questions/" + questionId)
      .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())).andExpect(status().isOk());
    assertFalse(Files.exists(questionImage));
    assertTrue(attachments.findByQuestionId(questionId).isEmpty());
  }

  @Test void surveyCopiesHaveIndependentFilesAndDeletingOriginalKeepsCopy() throws Exception {
    upload(AttachmentOwner.QUESTION, questionId).andExpect(status().isOk());
    upload(AttachmentOwner.RELATIONSHIP_SUBJECT, subjectId).andExpect(status().isOk());
    mvc.perform(post("/api/surveys/" + surveyId + "/copy").with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf()))
      .andExpect(status().isOk());
    List<ImageAttachment> copied = attachments.findAll().stream().filter(image -> !image.getSurveyId().equals(surveyId)).toList();
    assertEquals(2, copied.size());
    assertEquals(4, attachments.findAll().stream().map(ImageAttachment::getFilename).distinct().count());
    mvc.perform(delete("/api/surveys/" + surveyId).with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf()))
      .andExpect(status().isOk());
    for (ImageAttachment image : copied) assertArrayEquals(GIF, Files.readAllBytes(files.getPath(image.getFilename())));
    assertTrue(attachments.findBySurveyId(surveyId).isEmpty());
  }

  @Test void surveyPreviewStorageAlsoAcceptsAnimatedGifs() throws Exception {
    mvc.perform(multipart("/api/surveys/" + surveyId + "/image").file(gif())
      .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())).andExpect(status().isOk());
    mvc.perform(get("/api/surveys/" + surveyId + "/image")).andExpect(status().isOk())
      .andExpect(content().contentType("image/gif")).andExpect(content().bytes(GIF));
  }
}
