localStorage.removeItem("access_token");
localStorage.removeItem("login_mode");
localStorage.removeItem("flowops_owner_token");
localStorage.removeItem("flowops_owner_session");
localStorage.removeItem("flowops_owner_email");
sessionStorage.clear();
console.log("FlowOps browser session cleared.");
location.href = "/login";
