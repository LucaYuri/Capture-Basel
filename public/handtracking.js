/*
 * ml5.js HandPose - Hand Tracking
 * Kamera oben rechts positioniert
 * Zeigefinger als Maus-Cursor
 */

let handPose;
let video;
let hands = [];
let canvas;

// Kamera-Grösse (kleiner für die Ecke)
const CAM_WIDTH = 320;
const CAM_HEIGHT = 240;

// Cursor Element
let cursorElement;

// Pinch-Erkennung
let isPinching = false;
let wasPinching = false; // Vorheriger Zustand für mousedown/mouseup
const PINCH_THRESHOLD = 10; // Distanz in Pixeln

// Aktuelle Cursor-Position (geglättet)
let cursorX = 0;
let cursorY = 0;

// Rohe Cursor-Position (ungeglättet)
let rawCursorX = 0;
let rawCursorY = 0;

// Smoothing-Faktor (0 = keine Glättung, 1 = maximale Glättung)
const SMOOTHING = 0.7;

// Hand-Dragging
let draggedElement = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Pinch-Hold für Drag (verhindert versehentliches Verschieben)
const PINCH_HOLD_TIME = 700;
let pinchStartTime = 0;
let pinchHoldElement = null;
let isDragReady = false;

// Progress-Ring Element
let progressRing = null;

// Hand-Hover
let hoveredElement = null;
let hoveredFaceCam = false;

// Scaling mit zweiter Hand
const MIN_PINCH_DISTANCE = 10; // Minimale Distanz (geschlossener Pinch)
const MAX_PINCH_DISTANCE = 120; // Maximale Distanz (offene Hand)
const MIN_SCALE = 0.3; // Kleinste Skalierung
const MAX_SCALE = 5.0; // Grösste Skalierung
let currentScale = 1.0;
let smoothedPinchDistance = 60; // Geglättete Pinch-Distanz
let lastScaleTime = 0;
let scaleDebounceTimer = null;

// FaceCam Dragging & Scaling
let faceCamContainer = null;
let faceCamDragging = false;
let faceCamDragOffsetX = 0;
let faceCamDragOffsetY = 0;
let faceCamScale = 1.0;
let faceCamOriginalPos = { x: 0, y: 0 };
let faceCamOriginalScale = 1.0;
let faceCamLastInteraction = 0;
const FACECAM_RESET_TIME = 10000; // 10 Sekunden
let faceCamResetTimer = null;
let faceCamPinchHoldStart = 0;
let faceCamPinchReady = false;
let faceCamWasPinching = false;

function preload() {
  // Load the handPose model mit maxHands: 2
  handPose = ml5.handPose({ maxHands: 2 });
}

function setup() {
  // Canvas im Container oben rechts erstellen
  canvas = createCanvas(CAM_WIDTH, CAM_HEIGHT);
  canvas.parent("p5-container");

  // Create the webcam video and hide it
  video = createCapture(VIDEO);
  video.size(CAM_WIDTH, CAM_HEIGHT);
  video.hide();

  // Start detecting hands from the webcam video
  handPose.detectStart(video, gotHands);

  // Cursor-Element erstellen
  createCursorElement();

  // FaceCam Container initialisieren
  initFaceCamDragging();

  // Status aktualisieren
  updateStatus("Hand-Tracking bereit!");
}

// Cursor-Element im DOM erstellen
function createCursorElement() {
  cursorElement = document.createElement("div");
  cursorElement.id = "hand-cursor";
  cursorElement.style.cssText = `
    position: fixed;
    width: 30px;
    height: 30px;
    background: white;
    border-radius: 50%;
    pointer-events: none;
    z-index: 9999;
    transform: translate(-50%, -50%);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
    opacity: 0;
    transition: opacity 0.2s ease;
  `;
  document.body.appendChild(cursorElement);

  // Progress-Ring SVG erstellen
  progressRing = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  progressRing.id = "progress-ring";
  progressRing.setAttribute("width", "60");
  progressRing.setAttribute("height", "60");
  progressRing.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 9998;
    transform: translate(-50%, -50%) rotate(-90deg);
    opacity: 0;
  `;
  progressRing.innerHTML = `
    <circle cx="30" cy="30" r="25" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="4"/>
    <circle id="progress-arc" cx="30" cy="30" r="25" fill="none" stroke="black" stroke-width="4"
            stroke-dasharray="157" stroke-dashoffset="157" stroke-linecap="round"/>
  `;
  document.body.appendChild(progressRing);
}

// FaceCam Dragging initialisieren
function initFaceCamDragging() {
  faceCamContainer = document.getElementById("p5-container");
  if (!faceCamContainer) return;

  // Originalposition speichern (oben rechts)
  const rect = faceCamContainer.getBoundingClientRect();
  faceCamOriginalPos.x = rect.left;
  faceCamOriginalPos.y = rect.top;
  faceCamOriginalScale = 1.0;
}

// FaceCam Position & Scale zurücksetzen
function resetFaceCam() {
  if (!faceCamContainer) return;

  gsap.to(faceCamContainer, {
    x: 0,
    y: 0,
    scale: 1,
    duration: 0.5,
    ease: "power2.inOut",
  });

  faceCamScale = 1.0;
  faceCamDragging = false;
  faceCamPinchReady = false;
}

// FaceCam Interaktion tracken und Timer starten
function trackFaceCamInteraction() {
  faceCamLastInteraction = Date.now();

  // Reset Timer zurücksetzen
  clearTimeout(faceCamResetTimer);
  faceCamResetTimer = setTimeout(() => {
    resetFaceCam();
  }, FACECAM_RESET_TIME);
}

function draw() {
  // Draw the webcam video (gespiegelt für natürlichere Interaktion)
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);
  pop();

  // Draw all the tracked hand points
  for (let i = 0; i < hands.length; i++) {
    let hand = hands[i];

    // Daumen-Spitze (4) und Zeigefinger-Spitze (8)
    const thumbTip = hand.keypoints[4];
    const indexTip = hand.keypoints[8];

    if (thumbTip && indexTip) {
      // Gespiegelte x-Positionen
      const thumbX = width - thumbTip.x;
      const indexX = width - indexTip.x;

      // Transparenz für zweite Hand
      let alpha = 255; // Erste Hand: immer voll weiss
      if (i === 1) {
        // Zweite Hand: 60% wenn nicht dragging, 100% wenn dragging (Bilder oder FaceCam)
        alpha = ((isDragReady && draggedElement) || (faceCamPinchReady && faceCamDragging)) ? 255 : 153;
      }

      // Weisse Linie zwischen Daumen und Zeigefinger
      // Bei zweiter Hand nur wenn dragging aktiv ist (Bilder oder FaceCam)
      if (i === 0 || (i === 1 && ((isDragReady && draggedElement) || (faceCamPinchReady && faceCamDragging)))) {
        stroke(255, 255, 255, alpha);
        strokeWeight(2);
        line(thumbX, thumbTip.y, indexX, indexTip.y);
      }

      // Weisse Kreise an den Fingerspitzen - immer anzeigen
      fill(255, 255, 255, alpha);
      noStroke();
      circle(thumbX, thumbTip.y, 12);
      circle(indexX, indexTip.y, 12);

      // Text-Label über der Linie
      const midX = (thumbX + indexX) / 2;
      const midY = (thumbTip.y + indexTip.y) / 2;

      textAlign(CENTER, BOTTOM);
      textSize(12);
      fill(255, 255, 255);
      noStroke();

      if (i === 0) {
        // Erste Hand: Drag
        if ((isDragReady && draggedElement) || (faceCamPinchReady && faceCamDragging)) {
          text("is dragging", midX, midY - 10);
        } else {
          text("pinch to drag", midX, midY - 10);
        }
      } else if (i === 1) {
        // Zweite Hand: Scale - nur anzeigen wenn dragging aktiv ist (Bilder oder FaceCam)
        if (isDragReady && draggedElement) {
          text(currentScale.toFixed(2) + "x", midX, midY - 10);
        } else if (faceCamPinchReady && faceCamDragging) {
          text(faceCamScale.toFixed(2) + "x", midX, midY - 10);
        }
      }
    }
  }

  // Cursor mit Zeigefinger der ersten Hand aktualisieren
  updateHandCursor();

  // FaceCam Dragging und Scaling
  handleFaceCamInteraction();

  // Status aktualisieren
  if (hands.length > 0) {
    updateStatus(`${hands.length} Hand${hands.length > 1 ? "e" : ""} erkannt`);
  } else {
    updateStatus("Keine Hand erkannt - zeige deine Hand!");
  }

  // Hand-Status an UI senden
  if (window.updateHandStatus) {
    window.updateHandStatus(hands.length);
  }
}

// Hand-Cursor Position aktualisieren
function updateHandCursor() {
  // Deaktiviere Handtracking im Grid-Modus
  if (document.body.classList.contains("grid-mode")) {
    if (cursorElement) {
      cursorElement.style.opacity = "0";
      hideProgressRing();
    }
    return;
  }

  if (hands.length > 0 && cursorElement) {
    // Zeigefinger-Spitze ist Keypoint 8
    const indexTip = hands[0].keypoints[8];

    if (indexTip) {
      // Gespiegelte x-Position, skaliert auf Bildschirmgrösse
      rawCursorX = map(
        CAM_WIDTH - indexTip.x,
        0,
        CAM_WIDTH,
        0,
        window.innerWidth
      );
      rawCursorY = map(indexTip.y, 0, CAM_HEIGHT, 0, window.innerHeight);

      // Smoothing mit Lerp (lineare Interpolation)
      cursorX = lerp(cursorX, rawCursorX, 1 - SMOOTHING);
      cursorY = lerp(cursorY, rawCursorY, 1 - SMOOTHING);

      // Cursor smooth animieren mit GSAP
      gsap.to(cursorElement, {
        left: cursorX,
        top: cursorY,
        duration: 0.1,
        ease: "power2.out",
        overwrite: true,
      });
      cursorElement.style.opacity = "1";

      // Pinch-Erkennung und Cursor-Farbe
      isPinching = detectPinch(hands[0]);
      cursorElement.style.background = isPinching ? "black" : "white";

      // Hand-Hover
      handleHandHover();

      // Hand-Dragging
      handleHandDragging();

      // Zweite Hand für Skalierung
      handleSecondHandScaling();
    }
  } else if (cursorElement) {
    cursorElement.style.opacity = "0";

    // Progress-Ring verstecken wenn Cursor verschwindet
    hideProgressRing();

    // Wenn Hand verschwindet während Drag, Element loslassen
    if (draggedElement) {
      draggedElement.style.cursor = "grab";
      draggedElement.style.zIndex = "";
      draggedElement = null;
    }
    // Hover-Klasse entfernen
    if (hoveredElement) {
      hoveredElement.classList.remove("hand-hover");
      hoveredElement = null;
    }
    wasPinching = false;
    isPinching = false;
  }
}

// Hilfsfunktion: Aktuelle Skalierung eines Elements abrufen
function getElementScale(element) {
  return parseFloat(element.dataset.scale) || 1;
}

// Hilfsfunktion: Skalierung eines Elements speichern
function setElementScale(element, scale) {
  element.dataset.scale = scale;
}

// Hand-Hover Logik
function handleHandHover() {
  // Nicht hovern wenn FaceCam gedragged wird
  if (faceCamDragging) {
    if (hoveredElement) {
      hoveredElement.classList.remove("hand-hover");
      const baseScale = getElementScale(hoveredElement);
      gsap.to(hoveredElement, {
        scale: baseScale,
        duration: 0.1,
        ease: "power2.out",
      });
      hoveredElement = null;
    }
    return;
  }

  const element = document.elementFromPoint(cursorX, cursorY);
  const container = element ? element.closest(".image-container") : null;

  // Altes Element: Hover entfernen (mit GSAP zurückskalieren)
  if (hoveredElement && hoveredElement !== container) {
    hoveredElement.classList.remove("hand-hover");
    // Zurück zur gespeicherten Basis-Skalierung
    const baseScale = getElementScale(hoveredElement);
    gsap.to(hoveredElement, {
      scale: baseScale,
      duration: 0.1,
      ease: "power2.out",
    });
  }

  // Neues Element: Hover hinzufügen (mit GSAP grösser skalieren)
  if (container && container !== hoveredElement) {
    container.classList.add("hand-hover");
    // Leicht vergrössern basierend auf aktueller Skalierung
    const baseScale = getElementScale(container);
    gsap.to(container, {
      scale: baseScale * 1.08,
      duration: 0.1,
      ease: "power2.out",
    });
    hoveredElement = container;
  } else if (!container) {
    hoveredElement = null;
  }
}

// Hand-Dragging Logik
function handleHandDragging() {
  // Nicht draggen wenn FaceCam gedragged wird
  if (faceCamDragging) {
    if (draggedElement) {
      draggedElement.style.cursor = "grab";
      draggedElement.style.zIndex = "";
      draggedElement = null;
    }
    pinchStartTime = 0;
    pinchHoldElement = null;
    isDragReady = false;
    return;
  }

  // Pinch gestartet → Timer starten
  if (isPinching && !wasPinching) {
    const element = document.elementFromPoint(cursorX, cursorY);
    if (element) {
      const container = element.closest(".image-container");
      // NUR image-container, NICHT FaceCam
      if (container) {
        pinchStartTime = Date.now();
        pinchHoldElement = container;
        isDragReady = false;
      }
    }
  }
  // Pinch beendet → Element loslassen und Reset
  else if (!isPinching) {
    if (draggedElement) {
      draggedElement.style.cursor = "grab";
      draggedElement.style.zIndex = "";

      // Speichere Position nach dem Loslassen
      if (window.debouncedSave) {
        window.debouncedSave();
      }

      draggedElement = null;
    }
    pinchStartTime = 0;
    pinchHoldElement = null;
    isDragReady = false;
    hideProgressRing();
  }
  // Während Pinch → Prüfen ob Hold-Zeit erreicht
  else if (isPinching && pinchHoldElement && !isDragReady) {
    const holdDuration = Date.now() - pinchStartTime;
    // Progress-Ring aktualisieren
    updateProgressRing(holdDuration / PINCH_HOLD_TIME);

    if (holdDuration >= PINCH_HOLD_TIME) {
      // Hold-Zeit erreicht → Drag aktivieren
      isDragReady = true;
      draggedElement = pinchHoldElement;

      // Hole aktuelle GSAP Transform-Position
      const currentX = gsap.getProperty(draggedElement, "x") || 0;
      const currentY = gsap.getProperty(draggedElement, "y") || 0;

      // Offset = wo der Cursor relativ zur aktuellen Position ist
      dragOffsetX = cursorX - currentX;
      dragOffsetY = cursorY - currentY;

      draggedElement.style.cursor = "grabbing";
      draggedElement.style.zIndex = "20";
      hideProgressRing();
    }
  }
  // Während Drag → Element bewegen
  else if (isPinching && isDragReady && draggedElement) {
    const newX = cursorX - dragOffsetX;
    const newY = cursorY - dragOffsetY;

    // GSAP für smoothe Animation mit Transform
    gsap.to(draggedElement, {
      x: newX,
      y: newY,
      duration: 0.05,
      ease: "power2.out",
      overwrite: true,
    });
  }

  wasPinching = isPinching;
}

// Progress-Ring aktualisieren (progress: 0-1)
function updateProgressRing(progress) {
  if (!progressRing) return;

  // Position am Cursor
  progressRing.style.left = cursorX + "px";
  progressRing.style.top = cursorY + "px";
  progressRing.style.opacity = "1";

  // Kreis-Umfang = 2 * PI * r = 2 * 3.14159 * 25 ≈ 157
  const circumference = 157;
  const offset = circumference * (1 - Math.min(progress, 1));

  const arc = progressRing.querySelector("#progress-arc");
  if (arc) {
    arc.setAttribute("stroke-dashoffset", offset);
  }
}

// Progress-Ring verstecken
function hideProgressRing() {
  if (!progressRing) return;
  progressRing.style.opacity = "0";

  // Reset auf 0
  const arc = progressRing.querySelector("#progress-arc");
  if (arc) {
    arc.setAttribute("stroke-dashoffset", "157");
  }
}

// Zweite Hand für Skalierung des gegriffenen Elements
function handleSecondHandScaling() {
  // Nur wenn ein Element AKTIV gedragged wird (isPinching) und eine zweite Hand da ist
  if (!isDragReady || !draggedElement || !isPinching || hands.length < 2) {
    return;
  }

  const secondHand = hands[1];
  const thumbTip = secondHand.keypoints[4];
  const indexTip = secondHand.keypoints[8];

  if (thumbTip && indexTip) {
    // Distanz zwischen Daumen und Zeigefinger
    const pinchDistance = dist(thumbTip.x, thumbTip.y, indexTip.x, indexTip.y);

    // Smoothing der Pinch-Distanz
    smoothedPinchDistance = lerp(smoothedPinchDistance, pinchDistance, 0.3);

    // Distanz auf Skalierung mappen
    // Kleine Distanz (Pinch) = kleine Skalierung
    // Grosse Distanz (offen) = grosse Skalierung
    const targetScale = map(
      smoothedPinchDistance,
      MIN_PINCH_DISTANCE,
      MAX_PINCH_DISTANCE,
      MIN_SCALE,
      MAX_SCALE
    );

    // Skalierung begrenzen
    currentScale = constrain(targetScale, MIN_SCALE, MAX_SCALE);

    // Skalierung speichern
    setElementScale(draggedElement, currentScale);

    // Skalierung auf Element anwenden mit GSAP
    gsap.to(draggedElement, {
      scale: currentScale,
      duration: 0.05,
      ease: "power2.out",
      overwrite: "auto",
    });

    // Debounced Save nach Skalierung
    lastScaleTime = Date.now();
    clearTimeout(scaleDebounceTimer);
    scaleDebounceTimer = setTimeout(() => {
      if (Date.now() - lastScaleTime >= 500) {
        if (window.debouncedSave) {
          window.debouncedSave();
        }
      }
    }, 500);
  }
}

// FaceCam Interaktion behandeln (Dragging und Scaling)
function handleFaceCamInteraction() {
  if (!faceCamContainer) return;

  // Deaktiviere im Grid-Modus
  if (document.body.classList.contains("grid-mode")) {
    return;
  }

  // Keine Hände → Release und Hover entfernen
  if (hands.length === 0) {
    if (faceCamDragging) {
      faceCamDragging = false;
      faceCamPinchReady = false;
    }
    if (hoveredFaceCam) {
      gsap.to(faceCamContainer, {
        scale: faceCamScale,
        duration: 0.1,
        ease: "power2.out",
      });
      hoveredFaceCam = false;
    }
    // Progress-Ring verstecken
    hideProgressRing();
    return;
  }

  const firstHand = hands[0];
  const thumbTip = firstHand.keypoints[4];
  const indexTip = firstHand.keypoints[8];

  if (!thumbTip || !indexTip) return;

  // Cursor-Position über FaceCam?
  const faceCamRect = faceCamContainer.getBoundingClientRect();
  const isOverFaceCam = cursorX >= faceCamRect.left &&
                         cursorX <= faceCamRect.right &&
                         cursorY >= faceCamRect.top &&
                         cursorY <= faceCamRect.bottom;

  // Hover-Effekt (nur wenn nicht dragging)
  if (isOverFaceCam && !faceCamDragging && !faceCamPinchReady) {
    if (!hoveredFaceCam) {
      gsap.to(faceCamContainer, {
        scale: faceCamScale * 1.08,
        duration: 0.1,
        ease: "power2.out",
      });
      hoveredFaceCam = true;
    }
  } else if (!isOverFaceCam && hoveredFaceCam && !faceCamDragging) {
    gsap.to(faceCamContainer, {
      scale: faceCamScale,
      duration: 0.1,
      ease: "power2.out",
    });
    hoveredFaceCam = false;
  }

  const isPinchingNow = detectPinch(firstHand);

  // PINCH START über FaceCam → Timer starten
  if (isPinchingNow && !faceCamWasPinching && isOverFaceCam && !faceCamPinchReady) {
    faceCamPinchHoldStart = Date.now();
  }
  // PINCH RELEASE → Reset (wenn noch nicht dragging)
  else if (!isPinchingNow && !faceCamDragging && faceCamPinchHoldStart > 0) {
    faceCamPinchHoldStart = 0;
    hideProgressRing();
  }
  // PINCH HOLDING über FaceCam → Progress-Ring anzeigen & warte auf Hold-Zeit
  else if (isPinchingNow && isOverFaceCam && !faceCamPinchReady && faceCamPinchHoldStart > 0) {
    const holdDuration = Date.now() - faceCamPinchHoldStart;
    const progress = holdDuration / PINCH_HOLD_TIME;

    // Progress-Ring aktualisieren
    updateProgressRing(progress);

    if (holdDuration >= PINCH_HOLD_TIME) {
      // Drag aktivieren - NUR wenn Ring vollständig ist
      faceCamPinchReady = true;
      faceCamDragging = true;

      // Hole aktuelle GSAP Transform-Position
      const currentX = gsap.getProperty(faceCamContainer, "x") || 0;
      const currentY = gsap.getProperty(faceCamContainer, "y") || 0;

      // Offset = wo der Cursor relativ zur aktuellen transformierten Position ist
      // Die tatsächliche Position ist: originalPos + transform
      const actualX = faceCamOriginalPos.x + currentX;
      const actualY = faceCamOriginalPos.y + currentY;

      faceCamDragOffsetX = cursorX - actualX;
      faceCamDragOffsetY = cursorY - actualY;

      // Hover-Effekt entfernen beim Drag-Start
      if (hoveredFaceCam) {
        gsap.to(faceCamContainer, {
          scale: faceCamScale,
          duration: 0.1,
          ease: "power2.out",
        });
        hoveredFaceCam = false;
      }

      // Progress-Ring verstecken
      hideProgressRing();

      trackFaceCamInteraction();
    }
  }
  // DRAGGING → Bewege FaceCam (NUR wenn faceCamPinchReady === true)
  else if (isPinchingNow && faceCamDragging && faceCamPinchReady) {
    // Berechne neue Position: Cursor minus Offset
    const newX = cursorX - faceCamDragOffsetX - faceCamOriginalPos.x;
    const newY = cursorY - faceCamDragOffsetY - faceCamOriginalPos.y;

    // Direkt setzen ohne Animation für smooth tracking
    gsap.set(faceCamContainer, {
      x: newX,
      y: newY,
    });

    trackFaceCamInteraction();

    // ZWEITE HAND für Skalierung
    if (hands.length >= 2) {
      const secondHand = hands[1];
      const thumb2 = secondHand.keypoints[4];
      const index2 = secondHand.keypoints[8];

      if (thumb2 && index2) {
        const pinchDist = dist(thumb2.x, thumb2.y, index2.x, index2.y);
        smoothedPinchDistance = lerp(smoothedPinchDistance, pinchDist, 0.3);

        const targetScale = map(
          smoothedPinchDistance,
          MIN_PINCH_DISTANCE,
          MAX_PINCH_DISTANCE,
          MIN_SCALE,
          MAX_SCALE
        );

        faceCamScale = constrain(targetScale, MIN_SCALE, MAX_SCALE);

        // Direkt setzen ohne Animation für smooth scaling
        gsap.set(faceCamContainer, {
          scale: faceCamScale,
        });

        trackFaceCamInteraction();
      }
    }
  }
  // PINCH RELEASE → Reset (wenn dragging aktiv war)
  else if (!isPinchingNow && faceCamDragging) {
    faceCamDragging = false;
    faceCamPinchReady = false;
    faceCamPinchHoldStart = 0;
    hideProgressRing();
  }

  faceCamWasPinching = isPinchingNow;
}

// Pinch-Geste erkennen (Daumen und Zeigefinger nah beieinander)
function detectPinch(hand) {
  const thumbTip = hand.keypoints[4]; // Daumen-Spitze
  const indexTip = hand.keypoints[8]; // Zeigefinger-Spitze

  if (thumbTip && indexTip) {
    const distance = dist(thumbTip.x, thumbTip.y, indexTip.x, indexTip.y);
    return distance < PINCH_THRESHOLD;
  }
  return false;
}

// Verbindungslinien für die Hand zeichnen
function drawHandConnections(hand) {
  stroke(255, 255, 255, 200);
  strokeWeight(1.5);

  // Finger-Verbindungen (Thumb, Index, Middle, Ring, Pinky)
  const fingers = [
    [0, 1, 2, 3, 4], // Thumb
    [0, 5, 6, 7, 8], // Index
    [0, 9, 10, 11, 12], // Middle
    [0, 13, 14, 15, 16], // Ring
    [0, 17, 18, 19, 20], // Pinky
  ];

  for (let finger of fingers) {
    for (let i = 0; i < finger.length - 1; i++) {
      let p1 = hand.keypoints[finger[i]];
      let p2 = hand.keypoints[finger[i + 1]];
      // Gespiegelte x-Positionen
      line(width - p1.x, p1.y, width - p2.x, p2.y);
    }
  }

  // Handflächen-Verbindungen
  const palm = [5, 9, 13, 17, 0, 5];
  for (let i = 0; i < palm.length - 1; i++) {
    let p1 = hand.keypoints[palm[i]];
    let p2 = hand.keypoints[palm[i + 1]];
    line(width - p1.x, p1.y, width - p2.x, p2.y);
  }
}

// Callback function for when handPose outputs data
function gotHands(results) {
  hands = results;
}

// Status-Anzeige aktualisieren
function updateStatus(message) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = message;
  }
}

// Hilfsfunktion: Finger-Positionen abrufen (für spätere Interaktion)
function getFingerTip(handIndex, fingerName) {
  if (hands.length <= handIndex) return null;

  const fingerTips = {
    thumb: 4,
    index: 8,
    middle: 12,
    ring: 16,
    pinky: 20,
  };

  const hand = hands[handIndex];
  const tipIndex = fingerTips[fingerName];
  if (tipIndex !== undefined && hand.keypoints[tipIndex]) {
    const kp = hand.keypoints[tipIndex];
    // Gespiegelte Position zurückgeben, skaliert auf Bildschirmkoordinaten
    return {
      x: map(width - kp.x, 0, CAM_WIDTH, 0, window.innerWidth),
      y: map(kp.y, 0, CAM_HEIGHT, 0, window.innerHeight),
    };
  }
  return null;
}

// Globale Funktion für Zugriff von aussen
window.getHandData = function () {
  return hands;
};

window.getFingerTip = getFingerTip;

window.isPinching = function () {
  return isPinching;
};
