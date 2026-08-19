function showToast(message) {
  let toast = document.getElementById("toast");

  if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.hidden = false;

  setTimeout(() => {
      toast.hidden = true;
  }, 2500);
}