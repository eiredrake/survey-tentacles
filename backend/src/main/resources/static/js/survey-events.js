(() => {
    if (!window.EventSource) return;
    let source = null, connecting = false, active = true, preferenceInitialized = false;
    let cursorKey = null;
    const seen = new Set();

    function rememberCursor(message) {
        if (!message.lastEventId || !cursorKey) return;
        try { sessionStorage.setItem(cursorKey, message.lastEventId); } catch { /* Storage may be unavailable. */ }
    }

    async function initializePreference() {
        const section = document.getElementById("survey-notifications");
        const toggle = document.getElementById("survey-notifications-enabled");
        const status = document.getElementById("survey-notifications-status");
        const surveyId = new URLSearchParams(window.location.search).get("id");
        if (!section || !toggle || !status || !surveyId || preferenceInitialized) return;
        preferenceInitialized = true;
        section.hidden = false;
        const url = "/api/surveys/" + encodeURIComponent(surveyId) + "/notifications";
        let saved = false;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Unable to load notification preference.");
            saved = (await response.json()).enabled === true;
            toggle.checked = saved;
            toggle.disabled = false;
        } catch {
            status.textContent = "Unable to load notification settings. Reload to try again.";
            return;
        }
        toggle.addEventListener("change", async () => {
            toggle.disabled = true;
            status.textContent = "Saving…";
            try {
                const csrfResponse = await fetch("/csrf");
                if (!csrfResponse.ok) throw new Error("Unable to load CSRF token.");
                const csrf = await csrfResponse.json();
                const response = await fetch(url, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
                    body: JSON.stringify({ enabled: toggle.checked })
                });
                if (!response.ok) throw new Error("Unable to save notification preference.");
                saved = (await response.json()).enabled === true;
                toggle.checked = saved;
                status.textContent = saved ? "Notifications enabled for you." : "Notifications turned off.";
            } catch {
                toggle.checked = saved;
                status.textContent = "Unable to save notification settings. Please try again.";
                showToast(status.textContent, "error");
            } finally {
                toggle.disabled = false;
            }
        });
    }

    async function connect() {
        if (!active || source || connecting) return;
        connecting = true;
        try {
            const response = await fetch("/me");
            if (!response.ok) return;
            const user = await response.json();
            if (!active || !user.authorities?.includes("ROLE_ADMIN")) return;
            cursorKey = "survey-events-cursor:" + user.id;
            let cursor = null;
            try { cursor = sessionStorage.getItem(cursorKey); } catch { /* Storage may be unavailable. */ }
            source = new EventSource("/api/surveys/events" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""));
            source.addEventListener("ready", rememberCursor);
            source.addEventListener("survey-event", message => {
                rememberCursor(message);
                let event;
                try { event = JSON.parse(message.data); } catch { return; }
                if (!event || typeof event.id !== "string" || seen.has(event.id)) return;
                seen.add(event.id);
                if (seen.size > 1000) seen.delete(seen.values().next().value);
                if (event.type === "submission.saved" && typeof event.data?.userName === "string"
                    && typeof event.data?.surveyTitle === "string") {
                    showToast(event.data.userName + " submitted " + event.data.surveyTitle + ".", "notify");
                }
                window.dispatchEvent(new CustomEvent("survey-admin-event", { detail: event }));
            });
            // EventSource retries interruptions; the saved cursor also covers page navigation.
            await initializePreference();
        } catch (error) {
            console.warn("Unable to connect survey notifications.", error);
        } finally {
            connecting = false;
        }
    }

    window.addEventListener("pagehide", () => {
        active = false;
        source?.close();
        source = null;
    });
    window.addEventListener("pageshow", () => { active = true; connect(); });
    connect();
})();
