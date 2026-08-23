async function logout() {
  const csrfResponse = await fetch("/csrf");

  if (!csrfResponse.ok) {
      showToast("Unable to log out.", "error");
      return;
  }

  const csrf = await csrfResponse.json();

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