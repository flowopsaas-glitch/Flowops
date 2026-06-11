localStorage.removeItem("access_token");
localStorage.removeItem("flowops_owner_token");
localStorage.removeItem("flowops_owner_email");
localStorage.removeItem("login_mode");
sessionStorage.clear();
console.log("FlowOps browser session cleared.");
location.href = "/login";
