package org.eiredrake.tentacles;

import org.eiredrake.tentacles.model.PromotionalPage;
import org.eiredrake.tentacles.service.PromotionalContentService;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PromotionalContentTests {
  private final PromotionalContentService content = new PromotionalContentService();

  @Test void preservesApprovedDocumentFormattingAndIsIdempotent() {
    String html = "<h2>Heading</h2><h3>Subheading</h3><h4>Detail</h4><p><strong>Bold</strong><b>B</b><em>Italic</em><i>I</i><u>Underline</u><s>Strike</s><br></p>"
      + "<ul><li>Bullet</li></ul><ol><li>Number</li></ol><blockquote><p>Quote</p></blockquote><hr>"
      + "<table><caption>Schedule</caption><thead><tr><th>Day</th></tr></thead><tbody><tr><td>Monday</td></tr></tbody></table>";
    String safe = content.sanitize(html);
    for (String tag : new String[] {"h2", "h3", "h4", "p", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "table", "caption", "thead", "tbody", "tr", "th", "td"})
      assertTrue(safe.contains("<" + tag + ">"), tag + " was lost: " + safe);
    assertTrue(safe.contains("<br")); assertTrue(safe.contains("<hr"));
    assertEquals(safe, content.sanitize(safe));
  }

  @Test void removesScriptsEmbedsFormsImagesStylesClassesAndEventHandlers() {
    String safe = content.sanitize("<script>alert(1)</script><iframe src='https://example.com'></iframe><object data='x'></object><embed src='x'>"
      + "<form><input autofocus onfocus='alert(1)'><button>Send</button><textarea>bad</textarea><select><option>x</option></select></form>"
      + "<svg onload='alert(1)'><circle></circle></svg><canvas></canvas><video src='x'></video><audio src='x'></audio>"
      + "<img src=x onerror=alert(1)><style>body{display:none}</style><h1>Title</h1>"
      + "<p style='color:red' class='evil' id='target' onclick='alert(1)' onmouseover='alert(1)'>Readable <strong>text</strong></p>");
    for (String forbidden : new String[] {"<script", "<iframe", "<object", "<embed", "<form", "<input", "<button", "<textarea", "<select", "<option", "<svg", "<canvas", "<video", "<audio", "<img", "<style", "<h1", "style=", "class=", "id=", "onfocus", "onload", "onerror", "onclick", "onmouseover"})
      assertFalse(safe.contains(forbidden), forbidden + " survived: " + safe);
    assertTrue(safe.contains("Readable <strong>text</strong>"));
  }

  @Test void linkSchemesAndNewWindowRelationshipsAreRestricted() {
    for (String href : new String[] {"javascript:alert(1)", "JaVaScRiPt:alert(1)", "java&#x73;cript:alert(1)", "java&#10;script:alert(1)", "data:text/html,bad", "vbscript:msgbox(1)", "file:///etc/passwd"})
      assertFalse(content.sanitize("<a href='" + href + "'>click</a>").contains("href="), href);
    for (String href : new String[] {"https://example.com/path", "http://example.com", "/survey.html?id=123"}) {
      String safe = content.sanitize("<a href='" + href + "' target='_blank' onclick='alert(1)' rel='opener'>Link</a>");
      assertTrue(org.springframework.web.util.HtmlUtils.htmlUnescape(safe).contains("href=\"" + href + "\""), safe);
      assertTrue(safe.contains("noopener")); assertTrue(safe.contains("noreferrer"));
      assertFalse(safe.contains("onclick")); assertFalse(safe.contains("rel=\"opener\""));
      assertEquals(safe, content.sanitize(safe));
    }
  }

  @Test void legacyTextIsNeverInferredToBeHtmlAndRichStorageIsSanitized() {
    PromotionalPage page = new PromotionalPage();
    page.setContent("<strong>literal</strong> & \"quotes\"\n<script>alert(1)</script>");
    String legacy = content.render(page);
    assertTrue(legacy.contains("&lt;strong&gt;literal&lt;/strong&gt; &amp; &quot;quotes&quot;<br>"));
    assertFalse(legacy.contains("<script>"));
    content.prepareForSave(page);
    assertTrue(page.getContent().contains("<strong>literal</strong>"));
    page.setContentFormat("html"); content.prepareForSave(page);
    assertFalse(page.getContent().contains("<script>")); assertTrue(page.getContent().contains("<strong>literal</strong>"));
  }

  @Test void renderingResanitizesPreviouslyStoredRichHtmlAndBoundsInput() {
    PromotionalPage page = new PromotionalPage(); page.setContentFormat("html");
    page.setContent("<p onmouseover='alert(1)'>Safe</p><img src=x onerror=alert(1)>");
    assertEquals("<p>Safe</p>", content.render(page));
    page.setContent("x".repeat(PromotionalContentService.MAX_LENGTH + 1));
    assertThrows(IllegalArgumentException.class, () -> content.prepareForSave(page));
  }
}
