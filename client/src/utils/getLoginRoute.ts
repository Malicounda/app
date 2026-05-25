export function getLoginRoute(): string {
  if (typeof window !== "undefined") {
    const domain = (localStorage.getItem("domain") || "").toUpperCase();
    if (domain === "ALERTE") {
      return "/alerte-login";
    } else if (domain === "REBOISEMENT") {
      return "/reboisement-login";
    }
  }
  return "/login";
}
