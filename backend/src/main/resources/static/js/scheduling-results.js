function renderSchedulingResultList(section, results, unit = "vote") {
  const resultsHeading = document.createElement("h3");
  resultsHeading.textContent = "Results";

  section.appendChild(resultsHeading);

  const maxVotes = Math.max(0, ...results.map((result) => result.votes));

  const resultsList = document.createElement("div");
  resultsList.className = "scheduling-results";

  for (const result of results) {
    const item = document.createElement("div");
    item.className = "scheduling-result";

    if (maxVotes > 0 && result.votes === maxVotes) {
      item.classList.add("scheduling-result-leading");
    }

    const header = document.createElement("div");
    header.className = "scheduling-result-header";

    const date = document.createElement("span");
    date.textContent = formatSchedulingAvailability(result.date, result.dateTime, result.endDateTime);

    const votes = document.createElement("span");
    votes.textContent = `${result.votes} ${unit}${result.votes === 1 ? "" : "s"}`;

    header.appendChild(date);
    header.appendChild(votes);

    const barTrack = document.createElement("div");
    barTrack.className = "scheduling-result-track";

    const bar = document.createElement("div");
    bar.className = "scheduling-result-bar";

    const percentage = maxVotes > 0 ? (result.votes / maxVotes) * 100 : 0;

    bar.style.width = `${percentage}%`;

    barTrack.appendChild(bar);

    item.appendChild(header);
    item.appendChild(barTrack);

    resultsList.appendChild(item);
  }

  section.appendChild(resultsList);
}
