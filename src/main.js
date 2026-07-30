function playMusic() {
  const audio = document.querySelector("#bgMusic");
  if (audio) {
    audio.currentTime = 27;
    audio.play().then(() => {
      document.querySelector(".music-toggle")?.classList.add("is-playing");
    }).catch(err => console.log("Autoplay prevented:", err));
  }
}

function initMusicToggle() {
  const toggle = document.querySelector(".music-toggle");
  const audio = document.querySelector("#bgMusic");
  if (toggle && audio) {
    toggle.addEventListener("click", () => {
      if (audio.paused) {
        audio.play();
        toggle.classList.add("is-playing");
      } else {
        audio.pause();
        toggle.classList.remove("is-playing");
      }
    });
  }
}

function initCover() {
  const e = document.querySelector("#introCover");
  const t = e?.querySelector(".cover-opener");
  if (e && t) {
    t.addEventListener("click", () => {
      e.classList.add("is-open");
      window.setTimeout(() => {
        e.setAttribute("aria-hidden", "true");
      }, 1500);
      playMusic();
    }, { once: true });
  }
}

function initReveals() {
  const e = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    e.forEach(e => e.classList.add("is-visible"));
    return;
  }
  const t = new IntersectionObserver(e => {
    e.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("is-visible");
        t.unobserve(e.target);
      }
    });
  }, {
    threshold: 0.14,
    rootMargin: "0px 0px -8% 0px"
  });
  e.forEach(e => t.observe(e));
}

function drawScratchCover(e) {
  const t = e.getBoundingClientRect();
  const n = Math.max(1, window.devicePixelRatio || 1);
  e.width = Math.round(t.width * n);
  e.height = Math.round(t.height * n);
  const o = e.getContext("2d", { willReadFrequently: true });
  o.setTransform(n, 0, 0, n, 0, 0);
  o.clearRect(0, 0, t.width, t.height);
  const r = o.createLinearGradient(0, 0, t.width, t.height);
  r.addColorStop(0, "#f1d38e");
  r.addColorStop(0.25, "#e5be6f");
  r.addColorStop(0.55, "#dca84f");
  r.addColorStop(0.8, "#c59238");
  r.addColorStop(1, "#b58129");
  o.fillStyle = r;
  o.fillRect(0, 0, t.width, t.height);
  const a = o.createRadialGradient(0.28 * t.width, 0.24 * t.height, 0, 0.28 * t.width, 0.24 * t.height, 0.65 * t.width);
  a.addColorStop(0, "rgba(255, 248, 220, 0.55)");
  a.addColorStop(0.45, "rgba(253, 237, 192, 0.22)");
  a.addColorStop(1, "rgba(253, 237, 192, 0)");
  o.fillStyle = a;
  o.fillRect(0, 0, t.width, t.height);
  o.globalAlpha = 0.15;
  o.strokeStyle = "#fbf4e5";
  o.lineWidth = 9;
  for (let e = -t.height; e < t.width + t.height; e += 20) {
    o.beginPath();
    o.moveTo(e, 0);
    o.lineTo(e + 0.75 * t.height, t.height);
    o.stroke();
  }
  o.globalAlpha = 1;
}

function getCanvasPoint(e, t) {
  const n = t.getBoundingClientRect();
  return {
    x: e.clientX - n.left,
    y: e.clientY - n.top
  };
}

function eraseAt(e, t) {
  const n = e.getContext("2d", { willReadFrequently: true });
  n.save();
  n.globalCompositeOperation = "destination-out";
  const o = Math.max(18, 0.16 * e.getBoundingClientRect().width);
  const r = n.createRadialGradient(t.x, t.y, 4, t.x, t.y, o);
  r.addColorStop(0, "rgba(0,0,0,1)");
  r.addColorStop(0.68, "rgba(0,0,0,0.9)");
  r.addColorStop(1, "rgba(0,0,0,0)");
  n.fillStyle = r;
  n.beginPath();
  n.arc(t.x, t.y, o, 0, 2 * Math.PI);
  n.fill();
  n.restore();
}

function revealCard(e) {
  const t = e.querySelector("canvas");
  t.style.transition = "opacity 350ms ease";
  t.style.opacity = "0";
  e.dataset.revealed = "true";
}

function scratchProgress(e) {
  const t = e.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, e.width, e.height).data;
  let n = 0;
  for (let e = 3; e < t.length; e += 16) {
    if (t[e] < 60) n += 1;
  }
  return n / (t.length / 16);
}

function initScratchCards() {
  document.querySelectorAll(".scratch-card").forEach(e => {
    const t = e.querySelector("canvas");
    let n = false, o = 0;
    e.setAttribute("role", "button");
    e.setAttribute("tabindex", "0");
    e.setAttribute("aria-label", `Scratch to reveal ${e.dataset.label}`);
    const r = () => {
      t.style.opacity = "1";
      drawScratchCover(t);
      if ("true" === e.dataset.revealed) revealCard(e);
    };
    r();
    window.addEventListener("resize", r);
    t.addEventListener("pointerdown", r => {
      if ("true" !== e.dataset.revealed) {
        n = true;
        o = 0;
        t.setPointerCapture(r.pointerId);
        eraseAt(t, getCanvasPoint(r, t));
      }
    });
    t.addEventListener("pointermove", r => {
      if (n && "true" !== e.dataset.revealed) {
        o += 1;
        eraseAt(t, getCanvasPoint(r, t));
        if (o > 10 && scratchProgress(t) > 0.28) revealCard(e);
      }
    });
    t.addEventListener("pointerup", () => {
      if (n && "true" !== e.dataset.revealed) {
        n = false;
        if (o < 3 || scratchProgress(t) > 0.18) revealCard(e);
      }
    });
    t.addEventListener("pointercancel", () => {
      n = false;
    });
    e.addEventListener("keydown", t => {
      if ("Enter" === t.key || " " === t.key) {
        t.preventDefault();
        revealCard(e);
      }
    });
  });
}

function initDialog() {
  const e = document.querySelector("#rsvpDialog");
  const t = document.querySelectorAll("[data-open-rsvp]");
  const n = document.querySelectorAll("[data-close-rsvp]");
  if (!e) return;
  const o = () => {
    if ("function" == typeof e.showModal) e.showModal();
    else e.setAttribute("open", "");
    document.body.classList.add("modal-open");
  };
  const r = () => {
    if (e.open) e.close();
    else {
      e.removeAttribute("open");
      document.body.classList.remove("modal-open");
    }
  };
  t.forEach(e => e.addEventListener("click", o));
  n.forEach(e => e.addEventListener("click", r));
  e.addEventListener("click", t => {
    if (t.target === e && window.innerWidth > 480) r();
  });
  e.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
  });
}

function initGallery() {
  const e = document.querySelector(".gallery-window");
  const t = document.querySelector(".gallery-track");
  if (!e || !t) return;
  let n = false, o = 0, r = 0;
  e.addEventListener("pointerdown", a => {
    n = true;
    o = a.clientX;
    r = e.scrollLeft;
    t.style.animationPlayState = "paused";
    e.setPointerCapture(a.pointerId);
  });
  e.addEventListener("pointermove", t => {
    if (n) e.scrollLeft = r - (t.clientX - o);
  });
  e.addEventListener("pointerup", () => {
    n = false;
  });
  e.addEventListener("pointercancel", () => {
    n = false;
  });
}

function initCloudAnimation() {
  const e = document.querySelector(".schedule-section");
  const t = document.querySelector(".cloud-left");
  const n = document.querySelector(".cloud-right");
  if (!e || !t || !n) return;
  const o = () => {
    const o = e.getBoundingClientRect();
    const r = window.innerHeight;
    const a = 0.8 * r;
    const i = 0.2 * r;
    if (o.top < a && o.bottom > 0) {
      const e = a - o.top;
      const d = a - i;
      const s = Math.min(Math.max(e / d, 0), 1) * 400;
      t.style.transform = `translate3d(${-s}px, 0, 0)`;
      n.style.transform = `translate3d(${s}px, 0, 0)`;
    } else if (o.top >= a) {
      t.style.transform = "translate3d(0, 0, 0)";
      n.style.transform = "translate3d(0, 0, 0)";
    }
  };
  window.addEventListener("scroll", o, { passive: true });
  o();
}

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyed697uE4ghoUCtiCMSzRjfk_QuGihjsJIEYWqc493vE5X65dCOP1oCp7EFabDHdzN9g/exec";

function initRsvpForm() {
  const e = document.querySelector("#rsvpForm");
  const t = document.querySelector("#rsvpStatus");
  const n = document.querySelector("#rsvpSubmit");
  function o(e, n) {
    t.removeAttribute("hidden");
    t.className = `rsvp-status ${e}`;
    t.textContent = n;
  }
  if (e && t && n) {
    e.addEventListener("submit", async r => {
      r.preventDefault();
      const a = e.querySelector("[name='guest-name']").value.trim();
      const i = e.querySelector("[name='attendance']:checked")?.value ?? "";
      const c = e.querySelector("[name='guest-count']").value.trim();
      if (a) {
        if (i) {
          t.setAttribute("hidden", "");
          n.disabled = true;
          n.textContent = "Sending…";
          try {
            await fetch(GOOGLE_SCRIPT_URL, {
              method: "POST",
              mode: "no-cors",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify({
                name: a,
                attendance: i,
                guests: c || "0",
                food: "N/A",
                timestamp: (new Date()).toISOString()
              })
            });
            o("success", "✅ Thank you! Your RSVP has been recorded.");
            e.reset();
          } catch (e) {
            o("error", "Something went wrong. Please try again.");
          } finally {
            n.disabled = false;
            n.textContent = "Submit";
          }
        } else {
          o("error", "Please select your attendance.");
        }
      } else {
        o("error", "Please enter your name.");
      }
    });
  }
}

function initAntiCopy() {
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });
  document.addEventListener("keydown", function (e) {
    if ("F12" === e.key) e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const t = e.key.toLowerCase();
      if ("u" === t || "s" === t || "c" === t || "p" === t) e.preventDefault();
      if (e.shiftKey && ("i" === t || "j" === t || "c" === t)) e.preventDefault();
    }
  });
  document.addEventListener("dragstart", function (e) {
    if ("IMG" === e.target.nodeName.toUpperCase()) e.preventDefault();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initCover();
  initReveals();
  initScratchCards();
  initDialog();
  initRsvpForm();
  initGallery();
  initCloudAnimation();
  initAntiCopy();
  initMusicToggle();
});