(async function () {
  const controls = document.querySelector(".app-header .app-user");
  if (!controls) return;
  try {
    const response = await fetch("/me");
    if (!response.ok) return;
    const user = await response.json();
    document.getElementById("user").textContent = user.name || user.username;
    if (!user.authorities?.includes("ROLE_ADMIN")) return;
    const link = document.createElement("a");
    link.href = "/admin/index.html";
    link.className = "icon-button administration-link";
    link.title = "Administration";
    link.setAttribute("aria-label", "Administration");
    if (window.location.pathname.startsWith("/admin/")) link.setAttribute("aria-current", "location");
    link.innerHTML = '<i class="fa-solid fa-gear" aria-hidden="true"></i>';
    controls.insertBefore(link, document.getElementById("logout-button"));
  } catch (error) {
    console.warn("Unable to load administration navigation.", error);
  }
})();
