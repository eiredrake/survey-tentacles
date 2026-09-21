// Shared accessible icon controls; labels are text, never markup.
function createIconButton(label, icon, action) {
  const control = document.createElement("button");
  control.type = "button"; control.className = "icon-button";
  control.title = label; control.setAttribute("aria-label", label);
  const image = document.createElement("i");
  image.className = `fa-solid fa-${icon}`; image.setAttribute("aria-hidden", "true");
  control.appendChild(image); control.addEventListener("click", action);
  return control;
}
