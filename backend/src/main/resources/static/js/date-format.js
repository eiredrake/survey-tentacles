function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
  });
}        

function formatSchedulingDate(date, dateTime) {
if (dateTime) {
    return new Date(dateTime).toLocaleString(
        undefined,
        {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        }
    );
}

return formatDate(date);
}