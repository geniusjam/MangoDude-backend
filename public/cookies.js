(document.getElementById("cookieBtn") || {}).onclick = function () {
    document.cookie = "cookieUsage=true";
    document.getElementById("cookieNotice").style.display = "none";
};
