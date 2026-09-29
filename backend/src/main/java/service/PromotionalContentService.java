package org.eiredrake.tentacles.service;

import org.eiredrake.tentacles.model.PromotionalPage;
import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

@Service
public class PromotionalContentService {
  public static final int MAX_LENGTH = 100000;
  private static final PolicyFactory POLICY = new HtmlPolicyBuilder()
    .allowElements("p", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3", "h4", "ul", "ol", "li",
      "blockquote", "a", "table", "thead", "tbody", "tr", "th", "td", "caption", "hr")
    .allowAttributes("href", "title").onElements("a")
    .allowAttributes("target").matching(true, "_blank").onElements("a")
    .allowUrlProtocols("https", "http")
    .requireRelsOnLinks("noopener", "noreferrer")
    .toFactory();

  public String sanitize(String html) { return POLICY.sanitize(html == null ? "" : html); }

  public void prepareForSave(PromotionalPage page) {
    String value = page.getContent() == null ? "" : page.getContent();
    if (value.length() > MAX_LENGTH) throw new IllegalArgumentException("Content must be " + MAX_LENGTH + " characters or fewer, including formatting.");
    if ("html".equals(page.getContentFormat())) value = sanitize(value);
    // Sanitization can expand entities; enforce the bound on the stored representation too.
    if (value.length() > MAX_LENGTH) throw new IllegalArgumentException("Formatted content is too long. Shorten the content and try again.");
    page.setContent(value);
  }

  public String render(PromotionalPage page) {
    // Reapply the policy at every HTML boundary, including records written outside the API.
    if ("html".equals(page.getContentFormat())) return sanitize(page.getContent());
    String text = page.getContent() == null ? "" : page.getContent();
    return text.isEmpty() ? "" : "<p>" + HtmlUtils.htmlEscape(text).replace("\n", "<br>") + "</p>";
  }
}
