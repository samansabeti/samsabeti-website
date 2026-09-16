/* Sam Sabeti — personal site */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- reveal on scroll ---------- */
  var revealEls = document.querySelectorAll("[data-reveal]");
  revealEls.forEach(function (el) {
    var d = el.getAttribute("data-delay");
    if (d) el.style.transitionDelay = d + "ms";
  });

  if (!reduced && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- portrait entrance ---------- */
  var portrait = document.getElementById("portrait-img");
  if (portrait) {
    if (reduced) {
      portrait.classList.add("is-in");
    } else if (portrait.complete) {
      requestAnimationFrame(function () { portrait.classList.add("is-in"); });
    } else {
      portrait.addEventListener("load", function () { portrait.classList.add("is-in"); });
    }
  }

  /* ---------- smart-sticky nav: hide on scroll down, reveal on up ---------- */
  var nav = document.getElementById("nav");
  var hero = document.getElementById("top");
  var lastY = window.scrollY || 0;
  var navTicking = false;

  function navUpdate() {
    var y = window.scrollY || 0;
    if (!nav) return;
    nav.classList.toggle("is-scrolled", y > 8);
    if (hero) {
      nav.classList.toggle("has-name", hero.getBoundingClientRect().bottom <= 0);
    }
    if (y > 140 && y > lastY + 4) {
      nav.classList.add("is-hidden");
    } else if (y < lastY - 4 || y <= 140) {
      nav.classList.remove("is-hidden");
    }
    lastY = y;
    navTicking = false;
  }

  window.addEventListener("scroll", function () {
    if (navTicking) return;
    navTicking = true;
    requestAnimationFrame(navUpdate);
  }, { passive: true });
  navUpdate();

  /* ---------- team tiles: tap to reveal descriptor (touch) ---------- */
  if (window.matchMedia("(hover: none)").matches) {
    document.querySelectorAll(".client").forEach(function (tile) {
      tile.addEventListener("click", function (ev) {
        if (ev.target.closest("a")) return;
        tile.classList.toggle("is-tapped");
      });
    });
  }

  /* ---------- contact form (formsubmit.co) ---------- */
  var cform = document.getElementById("contact-form");
  if (cform) {
    var cfStatus = document.getElementById("cf-status");
    var cfBtn = cform.querySelector(".cform__send");
    cform.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (cfBtn.disabled) return;
      if (!cform.checkValidity()) {
        cfStatus.textContent = "Please fill in every field with a valid email.";
        cform.reportValidity();
        return;
      }
      cfBtn.disabled = true;
      cfStatus.textContent = "Sending…";
      var data = new FormData(cform);
      fetch(atob(["aHR0cHM6Ly9mb", "3Jtc3VibWl0Lm", "NvL2FqYXgvc2F", "iZXRpc3JAZ21h", "aWwuY29t"].join("")), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          message: data.get("message"),
          _subject: "Website contact",
          _honey: ""
        })
      }).then(function (res) {
        if (!res.ok) throw new Error("Contact service rejected the request");
        return res.json();
      }).then(function (result) {
        if (!result || (result.success !== true && result.success !== "true")) {
          throw new Error("Contact service did not confirm acceptance");
        }

        /* An analytics failure must never turn an accepted message into a retry. */
        cform.reset();
        cfStatus.textContent = "Sent — thanks. I'll get back to you soon.";
        cfBtn.disabled = false;
        try {
          if (window.posthog) {
            /* Link the submission to this visitor's profile: merges their anonymous
               session (source, sections viewed, device) into a person keyed by email. */
            var cfEmail = (data.get("email") || "").trim();
            var cfName = (data.get("name") || "").trim();
            if (cfEmail && typeof window.posthog.identify === "function") {
              window.posthog.identify(cfEmail, { email: cfEmail, name: cfName });
            }
            window.posthog.capture('contact_form_submitted', {
              name: cfName,
              email: cfEmail,
              message: (data.get("message") || "").trim(),
              submission_status: "accepted",
              instrumentation_version: 2
            });
          }
        } catch (error) {
          /* The message was accepted; analytics is best-effort. */
        }
      }).catch(function () {
        cfStatus.textContent = "Couldn't send — please try again.";
        cfBtn.disabled = false;
      });
    });
  }

  /* ---------- PostHog engagement tracking ---------- */
  function capture(eventName, properties) {
    try {
      if (window.posthog && typeof window.posthog.capture === "function") {
        window.posthog.capture(eventName, properties || {});
      }
    } catch (error) {
      /* Navigation and other site behaviour must work if analytics fails. */
    }
  }

  /* A meaningful view fills 35% of the section OR viewport, whichever is smaller.
     Capping by viewport height makes long mobile sections measurable. */
  var sectionLabels = { top: "Hero", about: "About", work: "Work", contact: "Contact" };
  var viewedSections = {};
  var sectionsTicking = false;
  function trackSectionViews() {
    sectionsTicking = false;
    var viewportHeight = window.innerHeight;
    Object.keys(sectionLabels).forEach(function (id) {
      if (viewedSections[id]) return;
      var section = document.getElementById(id);
      if (!section) return;
      var rect = section.getBoundingClientRect();
      var visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
      if (rect.height <= 0 || visibleHeight < Math.min(rect.height, viewportHeight) * 0.35) return;
      viewedSections[id] = true;
      capture("section_viewed", {
        section: id,
        section_label: sectionLabels[id],
        instrumentation_version: 2
      });
    });
  }
  function scheduleSectionViews() {
    if (sectionsTicking) return;
    sectionsTicking = true;
    requestAnimationFrame(trackSectionViews);
  }
  window.addEventListener("scroll", scheduleSectionViews, { passive: true });
  window.addEventListener("resize", scheduleSectionViews);
  window.addEventListener("load", scheduleSectionViews);
  scheduleSectionViews();

  /* Track maximum scroll depth once at each threshold per page load. */
  var reachedDepths = {};
  function trackScrollDepth() {
    var doc = document.documentElement;
    var scrollable = Math.max(doc.scrollHeight - window.innerHeight, 1);
    var depth = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
    [25, 50, 75, 100].forEach(function (threshold) {
      if (depth >= threshold && !reachedDepths[threshold]) {
        reachedDepths[threshold] = true;
        capture("scroll_depth", { depth_percent: threshold });
      }
    });
  }
  window.addEventListener("scroll", trackScrollDepth, { passive: true });
  window.addEventListener("load", trackScrollDepth);

  /* Track high-intent navigation and outbound clicks with readable labels. */
  document.addEventListener("click", function (ev) {
    var link = ev.target.closest("a");
    if (!link) return;
    var label = (link.textContent || link.getAttribute("aria-label") || "").trim();
    var destination = link.getAttribute("href") || "";

    if (link.closest("#nav")) {
      var navDestination = destination.replace(/^index\.html/, "") || "#top";
      var navLinks = { "#top": "Home", "#about": "About", "#work": "Work", "#contact": "Contact" };
      capture("global_nav_clicked", {
        link: navLinks[navDestination] || label,
        label: label,
        destination: navDestination
      });
    }

    if (/^https?:\/\//i.test(destination)) {
      var outboundUrl = new URL(destination, window.location.href);
      if (outboundUrl.hostname !== window.location.hostname) {
        capture("outbound_link_clicked", {
          label: label,
          destination: outboundUrl.href,
          destination_host: outboundUrl.hostname
        });
      }
    }
  });

  /* ---------- timeline trail: draws itself as you scroll ---------- */
  var tl = document.getElementById("timeline");
  var svg = document.getElementById("trail-svg");
  var path = document.getElementById("trail-path");
  if (!tl || !svg || !path) return;

  var pathLen = 0;

  function dotCenters() {
    var box = svg.getBoundingClientRect();
    var dots = tl.querySelectorAll(".tl__dot");
    return Array.prototype.map.call(dots, function (d) {
      var r = d.getBoundingClientRect();
      return {
        x: r.left - box.left + r.width / 2,
        y: r.top - box.top + r.height / 2
      };
    });
  }

  /* One straight vertical line through the dots. */
  function buildPath(pts) {
    if (pts.length < 2) return "";
    var x = pts[0].x;
    var startY = Math.max(pts[0].y - 48, 0);
    var endY = pts[pts.length - 1].y + 48;
    return "M " + x + " " + startY + " L " + x + " " + endY;
  }

  function layout() {
    var w = svg.clientWidth;
    var h = tl.clientHeight;
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    var d = buildPath(dotCenters());
    path.setAttribute("d", d);
    pathLen = path.getTotalLength();
    path.style.strokeDasharray = pathLen;
    draw();
  }

  function progress() {
    var r = tl.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    /* start drawing when the section top reaches 85% of the viewport,
       finish when its bottom passes 45% */
    var raw = (vh * 0.85 - r.top) / (r.height + vh * 0.4);
    return Math.min(1, Math.max(0, raw));
  }

  var ticking = false;
  function draw() {
    if (reduced) { path.style.strokeDashoffset = 0; return; }
    path.style.strokeDashoffset = pathLen * (1 - progress());
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      draw();
      ticking = false;
    });
  }

  /* ---------- gentle parallax on the portrait ---------- */
  var heroFigure = document.querySelector(".hero__portrait");
  function parallax() {
    if (reduced || !heroFigure || !portrait) return;
    var r = heroFigure.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    var offset = (r.top + r.height / 2 - window.innerHeight / 2) * 0.06;
    portrait.style.transform =
      (portrait.classList.contains("is-in") ? "scale(1) " : "") +
      "translateY(" + offset.toFixed(1) + "px)";
  }
  function onScrollAll() {
    onScroll();
    if (!ticking) {
      requestAnimationFrame(parallax);
    }
  }

  layout();
  window.addEventListener("scroll", onScrollAll, { passive: true });
  window.addEventListener("resize", function () { layout(); parallax(); });
  window.addEventListener("load", function () { layout(); parallax(); });
  parallax();
})();
