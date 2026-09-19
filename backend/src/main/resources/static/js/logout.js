async function logout() {
  let csrf;
  try { csrf = await getCsrfToken(); }
  catch (error) { showToast(error.message, "error"); return; }
  // Logout must submit a form so the browser follows the identity-provider redirect.
  if (typeof csrf.parameterName !== "string" || !csrf.parameterName) {
    showToast("Unable to log out: missing CSRF form parameter.", "error"); return;
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/logout";

  const csrfInput = document.createElement("input");
  csrfInput.type = "hidden";
  csrfInput.name = csrf.parameterName;
  csrfInput.value = csrf.token;

  form.appendChild(csrfInput);
  document.body.appendChild(form);

  form.submit();
}

const logoutButton =
  document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", logout);
}