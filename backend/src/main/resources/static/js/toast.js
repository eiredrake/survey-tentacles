function showToast(message, type = "info") {
  let toast = document.getElementById("toast");
  
  if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      document.body.appendChild(toast);
  }

  toast.dataset.type = type;
  toast.textContent = message;
  toast.hidden = false;

  setTimeout(() => {
      toast.hidden = true;
  }, 2500);
}