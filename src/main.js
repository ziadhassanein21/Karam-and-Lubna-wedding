const icon = (name) => {
  if (name === "play") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="5,3 19,12 5,21"></polygon></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>';
};

function initCover() {
  const cover = document.querySelector("#introCover");
  const opener = cover?.querySelector(".cover-opener");
  if (!cover || !opener) return;

  opener.addEventListener("click", () => {
    cover.classList.add("is-open");
    document.body.classList.add("audio-ready");
    const audio = document.querySelector("#invitationAudio");
    if (audio) {
      audio.muted = false;
      audio.play().catch(() => {});
    }
    window.setTimeout(() => {
      cover.setAttribute("aria-hidden", "true");
    }, 1500);
  }, { once: true });
}

function initReveals() {
  const revealItems = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.14,
    rootMargin: "0px 0px -8% 0px",
  });

  revealItems.forEach((item) => observer.observe(item));
}

function drawScratchCover(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
  gradient.addColorStop(0, "#dce8ee");
  gradient.addColorStop(0.25, "#d2dfe6");
  gradient.addColorStop(0.55, "#c8d7df");
  gradient.addColorStop(0.8, "#d0dde5");
  gradient.addColorStop(1, "#c4d3dc");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, rect.width, rect.height);

  const highlight = ctx.createRadialGradient(
    rect.width * 0.28,
    rect.height * 0.24,
    0,
    rect.width * 0.28,
    rect.height * 0.24,
    rect.width * 0.65,
  );
  highlight.addColorStop(0, "rgba(240,248,252,0.65)");
  highlight.addColorStop(0.45, "rgba(230,242,248,0.22)");
  highlight.addColorStop(1, "rgba(230,242,248,0)");
  ctx.fillStyle = highlight;
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = "#eef4f8";
  ctx.lineWidth = 9;
  for (let x = -rect.height; x < rect.width + rect.height; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + rect.height * 0.75, rect.height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function getCanvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function eraseAt(canvas, point) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const radius = Math.max(18, canvas.getBoundingClientRect().width * 0.16);
  const gradient = ctx.createRadialGradient(point.x, point.y, 4, point.x, point.y, radius);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(0.68, "rgba(0,0,0,0.9)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function revealCard(card) {
  const canvas = card.querySelector("canvas");
  canvas.style.transition = "opacity 350ms ease";
  canvas.style.opacity = "0";
  card.dataset.revealed = "true";
}

function scratchProgress(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let transparent = 0;
  for (let index = 3; index < pixels.length; index += 16) {
    if (pixels[index] < 60) transparent += 1;
  }
  return transparent / (pixels.length / 16);
}

function initScratchCards() {
  const cards = document.querySelectorAll(".scratch-card");
  cards.forEach((card) => {
    const canvas = card.querySelector("canvas");
    let scratching = false;
    let moves = 0;

    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `Scratch to reveal ${card.dataset.label}`);

    const setup = () => {
      canvas.style.opacity = "1";
      drawScratchCover(canvas);
      if (card.dataset.revealed === "true") {
        revealCard(card);
      }
    };

    setup();
    window.addEventListener("resize", setup);

    canvas.addEventListener("pointerdown", (event) => {
      if (card.dataset.revealed === "true") return;
      scratching = true;
      moves = 0;
      canvas.setPointerCapture(event.pointerId);
      eraseAt(canvas, getCanvasPoint(event, canvas));
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!scratching || card.dataset.revealed === "true") return;
      moves += 1;
      eraseAt(canvas, getCanvasPoint(event, canvas));
      if (moves > 10 && scratchProgress(canvas) > 0.28) {
        revealCard(card);
      }
    });

    canvas.addEventListener("pointerup", () => {
      if (!scratching || card.dataset.revealed === "true") return;
      scratching = false;
      if (moves < 3 || scratchProgress(canvas) > 0.18) {
        revealCard(card);
      }
    });

    canvas.addEventListener("pointercancel", () => {
      scratching = false;
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        revealCard(card);
      }
    });
  });
}

function initDialog() {
  const dialog = document.querySelector("#rsvpDialog");
  const openers = document.querySelectorAll("[data-open-rsvp]");
  const closers = document.querySelectorAll("[data-close-rsvp]");
  if (!dialog) return;

  const openDialog = () => {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    document.body.classList.add("modal-open");
  };

  const closeDialog = () => {
    if (dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
      document.body.classList.remove("modal-open");
    }
  };

  openers.forEach((button) => button.addEventListener("click", openDialog));
  closers.forEach((button) => button.addEventListener("click", closeDialog));

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog && window.innerWidth > 480) {
      closeDialog();
    }
  });

  dialog.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
  });
}

function initAudioToggle() {
  const toggle = document.querySelector("[data-audio-toggle]");
  const audio = document.querySelector("#invitationAudio");
  if (!toggle) return;
  let playing = true;

  toggle.addEventListener("click", () => {
    playing = !playing;
    toggle.setAttribute("aria-label", playing ? "Pause background music" : "Play background music");
    toggle.innerHTML = icon(playing ? "pause" : "play");
    if (audio) {
      if (playing) audio.play().catch(() => {});
      else audio.pause();
    }
  });
}

function initGallery() {
  const gallery = document.querySelector(".gallery-window");
  const track = document.querySelector(".gallery-track");
  if (!gallery || !track) return;

  let isDragging = false;
  let startX = 0;
  let startScroll = 0;

  gallery.addEventListener("pointerdown", (event) => {
    isDragging = true;
    startX = event.clientX;
    startScroll = gallery.scrollLeft;
    track.style.animationPlayState = "paused";
    gallery.setPointerCapture(event.pointerId);
  });

  gallery.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    gallery.scrollLeft = startScroll - (event.clientX - startX);
  });

  gallery.addEventListener("pointerup", () => {
    isDragging = false;
  });

  gallery.addEventListener("pointercancel", () => {
    isDragging = false;
  });
}

function initCloudAnimation() {
  const section = document.querySelector(".schedule-section");
  const cloudLeft = document.querySelector(".cloud-left");
  const cloudRight = document.querySelector(".cloud-right");
  if (!section || !cloudLeft || !cloudRight) return;

  const handleScroll = () => {
    const rect = section.getBoundingClientRect();
    const viewHeight = window.innerHeight;
    
    // Start parting when the top of the section is at 80% of the viewport height
    // Finish parting when the top of the section is at 20% of the viewport height
    const startY = viewHeight * 0.8;
    const endY = viewHeight * 0.2;
    
    if (rect.top < startY && rect.bottom > 0) {
      const distance = startY - rect.top;
      const range = startY - endY;
      const progress = Math.min(Math.max(distance / range, 0), 1);
      
      // Maximum parting translation is 400px to fully clear the 620px wide event list
      const maxTranslation = 400;
      const translation = progress * maxTranslation;
      
      cloudLeft.style.transform = `translate3d(${-translation}px, 0, 0)`;
      cloudRight.style.transform = `translate3d(${translation}px, 0, 0)`;
    } else if (rect.top >= startY) {
      cloudLeft.style.transform = "translate3d(0, 0, 0)";
      cloudRight.style.transform = "translate3d(0, 0, 0)";
    }
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();
}

document.addEventListener("DOMContentLoaded", () => {
  initCover();
  initReveals();
  initScratchCards();
  initDialog();
  initAudioToggle();
  initGallery();
  initCloudAnimation();
});
