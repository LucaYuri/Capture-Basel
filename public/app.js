const imageUpload = document.getElementById("image-upload");
const uploadPreview = document.getElementById("upload-preview");
const uploadPreviewCombined = document.querySelector(
  ".upload-preview-combined"
);
const generateBtn = document.getElementById("generate-btn");
const cancelBtn = document.getElementById("cancel-btn");
const resultContainer = document.getElementById("result-container");
const progressContainer = document.getElementById("progress-container");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");
const statusUpdates = document.getElementById("status-updates");
const randomImagesBtn = document.getElementById("random-images-btn");
const normalizeSizeBtn = document.getElementById("normalize-size-btn");
// Status indicators removed
// const connectionStatus = document.getElementById("connection-status");
// const handLeftStatus = document.getElementById("hand-left-status");
// const handRightStatus = document.getElementById("hand-right-status");

let uploadedImageFile = null;
let hoverInterval = null;
let currentQuartier = null;
let currentAbortController = null;
let currentMode = "grid"; // 'scene' oder 'grid'

// Mode Switch Event Listeners
document.querySelectorAll(".mode-switch-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;

    // Update active state
    document
      .querySelectorAll(".mode-switch-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    // Update current mode
    currentMode = mode;

    console.log("Mode switched to:", mode);

    // Switch between modes
    if (mode === "grid") {
      switchToGridMode();
    } else {
      switchToSceneMode();
    }
  });
});

// Switch to Grid Mode
function switchToGridMode() {
  document.body.classList.add("grid-mode");
  document.body.classList.remove("scene-mode");

  // Im Grid-Modus: Behalte aktive Quartiere für Multi-Select
  // Wenn nur eines aktiv war (vom Scene-Modus), deaktiviere alle für "alle anzeigen"
  if (activeQuartiers.size === 1) {
    activeQuartiers.clear();
    document.querySelectorAll(".quartier-toggle").forEach((btn) => {
      btn.classList.remove("active");
    });
  }

  populateGrid();
  filterGridByQuartiers();
}

// Switch to Scene Mode
function switchToSceneMode() {
  document.body.classList.add("scene-mode");
  document.body.classList.remove("grid-mode");

  // Im Scene-Modus: Single-Select - wähle das erste aktive Quartier oder das mit den meisten Bildern
  if (activeQuartiers.size > 0) {
    const firstActive = activeQuartiers.values().next().value;
    activeQuartiers.clear();
    showQuartier(firstActive);
  } else if (currentQuartier) {
    showQuartier(currentQuartier);
  }
}

// Populate Grid with all images
function populateGrid() {
  const gridContainer = document.getElementById("grid-container");
  gridContainer.innerHTML = ""; // Clear existing

  // Get all image containers and convert to array
  const allImages = Array.from(document.querySelectorAll(".image-container"));

  // Reverse the array so newest images come first
  allImages.reverse();

  allImages.forEach((container) => {
    const img = container.querySelector("img");
    const caption = container.querySelector(".caption");

    if (img && caption) {
      const quartierId = parseInt(container.dataset.quartier);
      const quartierName = quartierIdToName[quartierId] || "Unbekannt";

      // Extrahiere Datum/Uhrzeit aus dem Dateinamen (z.B. generated-26-01-04-20-04-24.png)
      const imageFilename = img.src.split("/").pop();
      const match = imageFilename.match(
        /generated-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/
      );
      let dateTimeStr = "Unbekannt";
      if (match) {
        const [_, year, month, day, hour, minute, second] = match;
        dateTimeStr = `${day}.${month}.20${year} ${hour}:${minute}:${second}`;
      }

      // Create grid item with flip card structure
      const gridItem = document.createElement("div");
      gridItem.className = "grid-item";
      gridItem.dataset.quartier = quartierId;

      const flipCard = document.createElement("div");
      flipCard.className = "flip-card";

      const flipCardInner = document.createElement("div");
      flipCardInner.className = "flip-card-inner";

      // FRONT SIDE
      const flipCardFront = document.createElement("div");
      flipCardFront.className = "flip-card-front";

      const gridImg = document.createElement("img");
      gridImg.src = img.src;
      gridImg.alt = caption.textContent;

      const captionContainer = document.createElement("div");
      captionContainer.className = "grid-item-caption-container";

      const gridCaption = document.createElement("div");
      gridCaption.className = "grid-item-caption";
      gridCaption.textContent = caption.textContent;

      captionContainer.appendChild(gridCaption);

      flipCardFront.appendChild(gridImg);
      flipCardFront.appendChild(captionContainer);

      // BACK SIDE
      const flipCardBack = document.createElement("div");
      flipCardBack.className = "flip-card-back";

      flipCardBack.innerHTML = `
        <div class="info-header">Bilddetails</div>
        <div class="info-row"><strong>Quartier:</strong> ${quartierName}</div>
        <div class="info-row"><strong>Datum:</strong> ${dateTimeStr}</div>
      `;

      let autoFlipTimeout = null;

      // Toggle flip on front card click
      flipCardFront.addEventListener("click", (e) => {
        e.stopPropagation();
        const isFlipped = flipCard.classList.contains("flipped");

        if (!isFlipped) {
          // Flip to back
          flipCard.classList.add("flipped");

          // Auto-flip back after 2 seconds
          autoFlipTimeout = setTimeout(() => {
            flipCard.classList.remove("flipped");
          }, 2000);
        } else {
          // Manual flip back
          flipCard.classList.remove("flipped");
          if (autoFlipTimeout) {
            clearTimeout(autoFlipTimeout);
          }
        }
      });

      // Toggle flip when clicking back side
      flipCardBack.addEventListener("click", (e) => {
        e.stopPropagation();
        flipCard.classList.remove("flipped");
        if (autoFlipTimeout) {
          clearTimeout(autoFlipTimeout);
        }
      });

      flipCardInner.appendChild(flipCardFront);
      flipCardInner.appendChild(flipCardBack);
      flipCard.appendChild(flipCardInner);

      // Apply random tilt to card
      const randomRotation = (Math.random() * 8 - 4).toFixed(2);
      flipCard.style.transform = `rotate(${randomRotation}deg)`;

      gridItem.appendChild(flipCard);
      gridContainer.appendChild(gridItem);
    }
  });
}

// Filter Grid nach ausgewählten Quartieren
function filterGridByQuartiers() {
  const gridContainer = document.getElementById("grid-container");
  const gridItems = gridContainer.querySelectorAll(".grid-item");

  gridItems.forEach((item) => {
    const quartierId = parseInt(item.dataset.quartier);

    // Wenn keine Quartiere ausgewählt sind, zeige alle
    if (activeQuartiers.size === 0) {
      item.style.display = "";
    } else {
      // Zeige nur Items von aktiven Quartieren
      item.style.display = activeQuartiers.has(quartierId) ? "" : "none";
    }
  });
}

// Aktualisiere alle Quartier-Zähler und sortiere Buttons
function updateQuartierCounts() {
  const grid = document.getElementById("quartiere-grid");
  const buttons = Array.from(grid.querySelectorAll(".quartier-toggle"));

  // Aktualisiere Zähler für jeden Button
  buttons.forEach((button) => {
    const quartierId = parseInt(button.dataset.quartier);
    const count = quartierImages[quartierId] ? quartierImages[quartierId].length : 0;
    const countElement = button.querySelector(".quartier-count");

    if (countElement) {
      countElement.textContent = count;

      // Füge/Entferne has-images Klasse
      if (count > 0) {
        countElement.classList.add("has-images");
      } else {
        countElement.classList.remove("has-images");
      }
    }
  });

  // Sortiere Buttons nach Bildanzahl (meiste zuerst)
  buttons.sort((a, b) => {
    const countA = quartierImages[parseInt(a.dataset.quartier)]?.length || 0;
    const countB = quartierImages[parseInt(b.dataset.quartier)]?.length || 0;
    return countB - countA;
  });

  // Buttons in neuer Reihenfolge ins Grid einfügen
  buttons.forEach((button) => grid.appendChild(button));
}

// Check internet connection - disabled (status indicators removed)
// function checkConnection() {
//   if (navigator.onLine) {
//     connectionStatus.classList.add("online");
//     connectionStatus.classList.remove("offline");
//   } else {
//     connectionStatus.classList.add("offline");
//     connectionStatus.classList.remove("online");
//   }
// }

// Initial connection check
// checkConnection();

// Listen for connection changes
// window.addEventListener("online", checkConnection);
// window.addEventListener("offline", checkConnection);

// Export hand status update function for handtracking.js - disabled (status indicators removed)
window.updateHandStatus = function (handCount) {
  // Hand status indicators removed from UI
  // Function kept for compatibility with handtracking.js
};

// GSAP Draggable Plugin registrieren
gsap.registerPlugin(Draggable);

// Mapping von Quartier-Namen zu IDs
const quartierNameToId = {
  "Altstadt Grossbasel": 1,
  "Altstadt Kleinbasel": 2,
  Vorstädte: 3,
  "Am Ring": 4,
  Breite: 5,
  Gundeldingen: 6,
  "St. Johann": 7,
  "St. Alban": 8,
  Iselin: 9,
  Bruderholz: 10,
  Bachletten: 11,
  Gotthelf: 12,
  Clara: 13,
  Wettstein: 14,
  Hirzbrunnen: 15,
  Rosental: 16,
  Matthäus: 17,
  Klybeck: 18,
  Kleinhüningen: 19,
  "Ausserhalb Basel": 20,
};

// Storage für Bilder pro Quartier
const quartierImages = {};
const MAX_IMAGES_PER_QUARTIER = 8; // Maximale Anzahl Bilder pro Quartier
for (let i = 1; i <= 20; i++) {
  quartierImages[i] = [];
}

// Z-Index Counter für Bilder
let imageZIndex = 1000;

// Funktion zum Hinzufügen eines Bildes zu einem Quartier (ohne Limitierung - Grid zeigt alle)
function addImageToQuartier(quartierId, imageData) {
  const images = quartierImages[quartierId];

  // Füge das neue Bild hinzu (keine Limitierung mehr)
  images.push(imageData);
  console.log(`✅ Added image to Quartier ${quartierId}. Current count: ${images.length}`);
}

// Funktion zum Speichern aller Bildpositionen
async function savePositions() {
  const positions = [];

  // Sammle zuerst alle Bilder mit DOM-Elementen (sichtbar im Scene)
  const visibleImages = new Map(); // URL -> position data

  document.querySelectorAll(".image-container").forEach((container) => {
    const img = container.querySelector("img");
    const imageUrl = img.src.replace(window.location.origin, ""); // Relative URL

    // Überspringe Placeholder-Bilder (Test-Bilder)
    if (imageUrl.includes("/placeholders/")) {
      return; // Nicht speichern
    }

    // Hole GSAP Transform-Werte
    const transform = gsap.getProperty(container, "transform");
    const matrix = new DOMMatrix(transform);

    const position = {
      imageUrl: imageUrl,
      caption: container.querySelector(".caption").textContent,
      quartierId: parseInt(container.dataset.quartier),
      x: matrix.m41, // Transform X
      y: matrix.m42, // Transform Y
      scale: parseFloat(container.dataset.scale) || 1,
      zIndex: parseInt(container.dataset.zIndex),
    };

    // Füge GPS-Daten hinzu (falls vorhanden)
    if (container.dataset.gpsLat && container.dataset.gpsLon) {
      position.gps = {
        lat: parseFloat(container.dataset.gpsLat),
        lon: parseFloat(container.dataset.gpsLon),
      };
    }

    visibleImages.set(imageUrl, position);
    positions.push(position);
  });

  // Füge ALLE anderen Bilder aus quartierImages hinzu (die nicht sichtbar sind)
  for (let i = 1; i <= 20; i++) {
    for (const imgData of quartierImages[i]) {
      // Nur hinzufügen wenn NICHT bereits als sichtbares Bild erfasst
      if (!visibleImages.has(imgData.url)) {
        positions.push({
          imageUrl: imgData.url,
          caption: imgData.caption || "object",
          quartierId: i,
          x: 0,
          y: 0,
          scale: 1,
          zIndex: 1000
        });
      }
    }
  }

  console.log("💾 Saving positions:", positions.length, "images");
  console.log("Positions data:", positions);

  try {
    const response = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: positions }),
    });

    if (response.ok) {
      console.log("✅ Positions saved successfully");
    } else {
      console.error(
        "❌ Failed to save positions:",
        response.status,
        response.statusText
      );
    }
  } catch (error) {
    console.error("❌ Failed to save positions:", error);
  }
}

// Debounce-Funktion für Auto-Save
let saveTimeout = null;
function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(savePositions, 500);
}

// Exportiere für Handtracking
window.debouncedSave = debouncedSave;

// Funktion zum Erstellen eines draggable image-containers
function createDraggableImage(
  imageUrl,
  caption,
  quartierId,
  savedPosition = null,
  gps = null
) {
  const container = document.createElement("div");
  container.className = "image-container";
  container.dataset.quartier = quartierId;

  // Speichere GPS-Daten im container (falls vorhanden)
  if (gps) {
    container.dataset.gpsLat = gps.lat;
    container.dataset.gpsLon = gps.lon;
  } else if (savedPosition && savedPosition.gps) {
    container.dataset.gpsLat = savedPosition.gps.lat;
    container.dataset.gpsLon = savedPosition.gps.lon;
  }

  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = caption;

  const captionDiv = document.createElement("div");
  captionDiv.className = "caption";
  captionDiv.textContent = caption;

  container.appendChild(img);
  container.appendChild(captionDiv);

  // Setze z-index
  if (savedPosition) {
    container.style.zIndex = savedPosition.zIndex;
    container.dataset.zIndex = savedPosition.zIndex;
    container.dataset.scale = savedPosition.scale.toString();
    imageZIndex = Math.max(imageZIndex, savedPosition.zIndex + 1);
  } else {
    container.style.zIndex = imageZIndex++;
    container.dataset.zIndex = container.style.zIndex;
    container.dataset.scale = "1";
  }

  // Zum Body hinzufügen
  document.body.appendChild(container);

  // GSAP Draggable ohne Inertia für direktes Folgen der Maus
  const draggableInstance = Draggable.create(container, {
    type: "x,y",
    inertia: false,
    onPress: function () {
      // Bringe Element nach vorne beim Greifen
      container.style.zIndex = imageZIndex++;
      container.dataset.zIndex = container.style.zIndex;
    },
    onDragEnd: function () {
      // Speichere Position nach dem Drag
      debouncedSave();
    },
  })[0];

  // Setze Position und Skalierung NACH Draggable-Erstellung
  if (savedPosition) {
    gsap.set(container, {
      x: savedPosition.x,
      y: savedPosition.y,
      scale: savedPosition.scale,
    });
    // Update Draggable internal values
    draggableInstance.update();
  } else {
    // Berechne initiale Position für neue Bilder
    const sidebarWidth = 320;
    const canvasWidth = window.innerWidth - sidebarWidth;
    const canvasHeight = window.innerHeight;

    const centerX = sidebarWidth + canvasWidth / 2;
    const centerY = canvasHeight / 2;

    const randomOffsetX = (Math.random() - 0.5) * 200;
    const randomOffsetY = (Math.random() - 0.5) * 200;

    const spawnX = centerX + randomOffsetX;
    const spawnY = centerY + randomOffsetY;

    // Setze Position und Skalierung mit GSAP
    const initialScale = parseFloat(container.dataset.scale) || 1;
    gsap.set(container, {
      x: spawnX,
      y: spawnY,
      scale: initialScale,
    });
    draggableInstance.update();
  }

  // Scroll zum Skalieren
  img.addEventListener("wheel", (e) => {
    e.preventDefault();
    let scale = parseFloat(container.dataset.scale) || 1;
    scale += e.deltaY * -0.001;
    scale = Math.min(Math.max(0.1, scale), 5);
    container.dataset.scale = scale;
    gsap.to(container, {
      scale: scale,
      duration: 0.1,
    });
    // Speichere Skalierung
    debouncedSave();
  });

  // Hover-Effekt mit GSAP (da Draggable transform überschreibt)
  container.addEventListener("mouseenter", () => {
    const scale = parseFloat(container.dataset.scale) || 1;
    gsap.to(container, {
      scale: scale * 1.08,
      duration: 0.3,
      ease: "power2.out",
    });
  });
  container.addEventListener("mouseleave", () => {
    const scale = parseFloat(container.dataset.scale) || 1;
    gsap.to(container, {
      scale: scale,
      duration: 0.3,
      ease: "power2.out",
    });
  });

  return container;
}

// Set für aktive Quartiere (für Multi-Select im Grid-Modus)
let activeQuartiers = new Set();

// Quartier Toggle Buttons klickbar machen
document.querySelectorAll(".quartier-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const quartierId = parseInt(button.dataset.quartier);

    if (currentMode === "grid") {
      // Grid-Modus: Multi-Toggle erlaubt
      button.classList.toggle("active");

      if (button.classList.contains("active")) {
        activeQuartiers.add(quartierId);
      } else {
        activeQuartiers.delete(quartierId);
      }

      // Grid mit gefilterten Quartieren aktualisieren
      filterGridByQuartiers();
    } else {
      // Scene-Modus: Single-Select
      showQuartier(quartierId);
    }
  });
});

// Funktion zum Laden und Wiederherstellen aller gespeicherten Bilder
async function loadSavedPositions() {
  try {
    console.log("📥 Loading saved positions...");
    const response = await fetch("/api/positions");

    if (!response.ok) {
      console.error(
        "❌ Failed to load positions:",
        response.status,
        response.statusText
      );
      return;
    }

    const data = await response.json();
    console.log("📦 Received data:", data);

    if (data.images && data.images.length > 0) {
      console.log("🔄 Loading", data.images.length, "saved images...");

      // Lade ALLE gespeicherten Bilder (Grid zeigt alle, Scene zeigt nur letzte 8)
      for (const savedImage of data.images) {
        console.log(
          "  Loading image:",
          savedImage.caption,
          "at",
          savedImage.x,
          savedImage.y
        );

        // Erstelle Bild mit gespeicherter Position
        const container = createDraggableImage(
          savedImage.imageUrl,
          savedImage.caption,
          savedImage.quartierId,
          savedImage
        );

        // Füge zum Quartier-Array hinzu
        quartierImages[savedImage.quartierId].push({
          url: savedImage.imageUrl,
          element: container,
          caption: savedImage.caption,
        });
      }

      console.log("✅ All saved images loaded successfully");

      // Aktualisiere alle Quartier-Zähler
      updateQuartierCounts();

      // Finde Quartier mit den meisten Bildern
      let maxCount = 0;
      let quartierWithMostImages = null;

      for (let i = 1; i <= 20; i++) {
        const count = quartierImages[i].length;
        if (count > maxCount) {
          maxCount = count;
          quartierWithMostImages = i;
        }
      }

      // Zeige automatisch das Quartier mit den meisten Bildern
      if (quartierWithMostImages && maxCount > 0) {
        console.log(
          "🎯 Auto-selecting Quartier",
          quartierWithMostImages,
          "with",
          maxCount,
          "images"
        );
        showQuartier(quartierWithMostImages);
      }
    } else {
      console.log("ℹ️ No saved images found");
    }
  } catch (error) {
    console.error("❌ Failed to load saved positions:", error);
  }
}

// Beim Laden der Seite gespeicherte Bilder laden
window.addEventListener("DOMContentLoaded", async () => {
  // Lade gespeicherte Bilder
  await loadSavedPositions();

  // Aktiviere Grid-Modus als Standard
  switchToGridMode();

  // Info Button Event Listeners
  const infoBtn = document.getElementById("info-btn");
  const infoModal = document.getElementById("info-modal");
  const infoCloseBtn = document.getElementById("info-close-btn");

  infoBtn.addEventListener("click", () => {
    infoModal.classList.remove("hidden");
  });

  infoCloseBtn.addEventListener("click", () => {
    infoModal.classList.add("hidden");
  });

  // Close modal when clicking outside content
  infoModal.addEventListener("click", (e) => {
    if (e.target === infoModal) {
      infoModal.classList.add("hidden");
    }
  });

  // Close modal with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !infoModal.classList.contains("hidden")) {
      infoModal.classList.add("hidden");
    }
  });
});

// Mapping von Quartier-IDs zu Namen (für Display)
const quartierIdToName = {
  1: "Altstadt Grossbasel",
  2: "Altstadt Kleinbasel",
  3: "Vorstädte",
  4: "Am Ring",
  5: "Breite",
  6: "Gundeldingen",
  7: "St. Johann",
  8: "St. Alban",
  9: "Iselin",
  10: "Bruderholz",
  11: "Bachletten",
  12: "Gotthelf",
  13: "Clara",
  14: "Wettstein",
  15: "Hirzbrunnen",
  16: "Rosental",
  17: "Matthäus",
  18: "Klybeck",
  19: "Kleinhüningen",
  20: "Ausserhalb Basel",
};

// Zeige ein bestimmtes Quartier (Scene-Modus: Single-Select)
function showQuartier(quartierId) {
  currentQuartier = quartierId;

  // Aktualisiere die große Quartier-Anzeige
  const quartierNameDisplay = document.getElementById("current-quartier-name");
  const quartierName = quartierIdToName[quartierId] || "—";
  if (quartierNameDisplay) {
    quartierNameDisplay.textContent = quartierName;

    // Animation für Wechsel
    gsap.from(quartierNameDisplay, {
      scale: 0.95,
      opacity: 0,
      duration: 0.3,
      ease: "power2.out",
    });
  }

  // Deaktiviere alle anderen Toggle-Buttons (Single-Select im Scene-Modus)
  document.querySelectorAll(".quartier-toggle").forEach((btn) => {
    const btnQuartierId = parseInt(btn.dataset.quartier);
    if (btnQuartierId !== quartierId) {
      btn.classList.remove("active");
    }
  });

  // Aktiviere den aktuellen Toggle-Button
  const activeButton = document.querySelector(
    `.quartier-toggle[data-quartier="${quartierId}"]`
  );
  if (activeButton) {
    activeButton.classList.add("active");
  }

  // Aktualisiere activeQuartiers Set für Konsistenz
  activeQuartiers.clear();
  activeQuartiers.add(quartierId);

  // Zeige nur Bilder dieses Quartiers
  displayQuartierImages(quartierId);
}

// Exportiere showQuartier für handtracking.js
window.showQuartier = showQuartier;

// Exportiere currentQuartier für handtracking.js
Object.defineProperty(window, "currentQuartier", {
  get: () => currentQuartier,
  set: (value) => {
    currentQuartier = value;
  },
});

// Zeige alle Bilder eines Quartiers im Result Container
function displayQuartierImages(quartierId) {
  // Im Grid-Modus nichts tun (Grid zeigt alle Bilder automatisch)
  if (currentMode === "grid") {
    return;
  }

  const images = quartierImages[quartierId];

  // Verstecke alle image-container
  document.querySelectorAll(".image-container").forEach((container) => {
    container.style.display = "none";
  });

  // Im Scene-Modus zeige nur die letzten MAX_IMAGES_PER_QUARTIER Bilder
  if (images.length === 0) {
    resultContainer.innerHTML =
      '<div class="placeholder">Generated image will appear here</div>';
  } else {
    resultContainer.innerHTML = "";

    // Nimm nur die letzten MAX_IMAGES_PER_QUARTIER Bilder
    const imagesToShow = images.slice(-MAX_IMAGES_PER_QUARTIER);

    imagesToShow.forEach((containerData) => {
      const container = containerData.element;
      if (container) {
        container.style.display = "block";
      }
    });

    console.log(`📺 Scene Mode: Showing ${imagesToShow.length} of ${images.length} images for Quartier ${quartierId}`);
  }
}

// Handle image upload preview
imageUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    uploadedImageFile = file;
    const reader = new FileReader();
    reader.onload = (event) => {
      uploadPreview.src = event.target.result;
      uploadPreviewCombined.classList.add("has-uploaded-image");
    };
    reader.readAsDataURL(file);

    // Visual feedback
    gsap.from(uploadPreview, {
      scale: 0.9,
      opacity: 0,
      duration: 0.3,
      ease: "power2.out",
    });
  }
});

// Handle cancel button
cancelBtn.addEventListener("click", () => {
  if (currentAbortController) {
    currentAbortController.abort();
    progressText.textContent = "Generation cancelled";
    progressFill.style.backgroundColor = "#ef4444";

    setTimeout(() => {
      progressContainer.classList.add("hidden");
      progressFill.style.backgroundColor = "";
      cancelBtn.classList.add("hidden");
      generateBtn.classList.remove("disabled");
      uploadPreviewCombined.classList.remove("disabled");
      if (hoverInterval) {
        clearInterval(hoverInterval);
        hoverInterval = null;
        generateBtn.src = "gen-button.jpg";
      }
    }, 1500);
  }
});

// Handle generate button
generateBtn.addEventListener("click", async () => {
  if (!uploadedImageFile) {
    alert("Upload an image first");
    return;
  }

  // Disable UI elements during generation
  generateBtn.classList.add("disabled");
  uploadPreviewCombined.classList.add("disabled");
  cancelBtn.classList.remove("hidden");

  // Start image hover animation
  hoverInterval = setInterval(() => {
    if (generateBtn.src.includes("gen-button_hover.jpg")) {
      generateBtn.src = "gen-button.jpg";
    } else {
      generateBtn.src = "gen-button_hover.jpg";
    }
  }, 400);

  progressContainer.classList.remove("hidden");
  progressFill.style.width = "0%";
  progressText.textContent = "Analyzing image...";

  // Create new AbortController for this request
  currentAbortController = new AbortController();

  try {
    const formData = new FormData();
    formData.append("image", uploadedImageFile);

    const response = await fetch("/api/generate", {
      method: "POST",
      body: formData,
      signal: currentAbortController.signal,
    });

    if (!response.ok) {
      throw new Error("Generation failed");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "progress") {
              const progress = data.progress || 0;
              progressFill.style.width = `${progress}%`;
              progressText.textContent = data.message || "Generating...";
            } else if (data.type === "error") {
              progressText.textContent = data.message;
              progressFill.style.width = "100%";
              progressFill.style.backgroundColor = "#ff4444";
              setTimeout(() => {
                progressContainer.classList.add("hidden");
                progressFill.style.backgroundColor = "";
                cancelBtn.classList.add("hidden");
              }, 5000);
              generateBtn.classList.remove("disabled");
              uploadPreviewCombined.classList.remove("disabled");
              if (hoverInterval) {
                clearInterval(hoverInterval);
                hoverInterval = null;
                generateBtn.src = "gen-button.jpg";
              }
              return;
            } else if (data.type === "result") {
              console.log("========================================");
              console.log("🎯 RESULT RECEIVED FROM BACKEND:");
              console.log("Full data object:", JSON.stringify(data, null, 2));
              console.log("data.quartier:", data.quartier);
              console.log("data.quartier.nummer:", data.quartier?.nummer);
              console.log("data.quartier.name:", data.quartier?.name);
              console.log("data.quartier.label:", data.quartier?.label);
              console.log("========================================");

              if (data.imageUrl && data.quartier) {
                // Bestimme die Quartier-ID NUR über den Namen
                let quartierId = null;

                // Verwende IMMER den Namen für das Mapping
                if (data.quartier.name) {
                  quartierId = quartierNameToId[data.quartier.name];
                  console.log(
                    "🔍 Mapping name to ID:",
                    data.quartier.name,
                    "->",
                    quartierId
                  );
                } else if (data.quartier.label) {
                  quartierId = quartierNameToId[data.quartier.label];
                  console.log(
                    "🔍 Mapping label to ID:",
                    data.quartier.label,
                    "->",
                    quartierId
                  );
                }

                // Fallback auf Quartier 20 (Ausserhalb Basel)
                if (!quartierId || quartierId < 1 || quartierId > 20) {
                  console.warn(
                    "⚠️ Could not map quartier name, using fallback 20"
                  );
                  console.warn("   Name:", data.quartier.name);
                  console.warn(
                    "   Available mappings:",
                    Object.keys(quartierNameToId)
                  );
                  quartierId = 20;
                }

                console.log("🎯 FINAL QUARTIER ID:", quartierId);
                console.log(
                  "📁 Current quartierImages array:",
                  quartierImages[quartierId]
                );

                // Erstelle image-container Element
                const imageContainer = createDraggableImage(
                  data.imageUrl,
                  data.detectedObject,
                  quartierId,
                  null, // savedPosition
                  data.gps || null // GPS
                );

                // Füge Container zum Quartier hinzu (mit FIFO-Limitierung)
                addImageToQuartier(quartierId, {
                  url: data.imageUrl,
                  element: imageContainer,
                  caption: data.detectedObject,
                });

                // Starte Pulsier-Animation für den Toggle-Button
                const quartierButton = document.querySelector(
                  `.quartier-toggle[data-quartier="${quartierId}"]`
                );
                if (quartierButton) {
                  quartierButton.classList.add("pulse");
                  console.log(
                    "💫 Added pulse animation to Quartier",
                    quartierId
                  );
                  setTimeout(() => {
                    quartierButton.classList.remove("pulse");
                  }, 1500);
                }

                // Aktualisiere Quartier-Zähler
                updateQuartierCounts();

                // Zeige dieses Quartier sofort (nur im Scene-Modus)
                console.log("🔄 Switching to quartier view:", quartierId);
                showQuartier(quartierId);

                // Aktualisiere Grid wenn im Grid-Modus
                if (currentMode === "grid") {
                  populateGrid();
                }

                // Speichere neue Bildposition
                savePositions();
              } else {
                console.error("Missing imageUrl or quartier in result:", data);
              }

              progressFill.style.width = "100%";
              progressText.textContent = `"${data.detectedObject}" erfolgreich generiert!`;

              setTimeout(() => {
                progressContainer.classList.add("hidden");
                cancelBtn.classList.add("hidden");

                // Reset upload preview
                uploadPreview.src = "addimg.jpg";
                uploadPreviewCombined.classList.remove("has-uploaded-image");
                uploadedImageFile = null;
              }, 2000);
            }
          } catch (e) {
            console.error("Error parsing SSE data:", e, "Line:", line);
          }
        } else if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.type === "error") {
              throw new Error(data.message || "Unknown error");
            }
          } catch (e) {
            // Not JSON, ignore
          }
        }
      }
    }
  } catch (error) {
    console.error("Error:", error);

    // Check if error was due to abort
    if (error.name === "AbortError") {
      console.log("Generation was cancelled by user");
    } else {
      alert("Error generating image: " + error.message);
      progressContainer.classList.add("hidden");
      cancelBtn.classList.add("hidden");
    }
  } finally {
    generateBtn.classList.remove("disabled");
    uploadPreviewCombined.classList.remove("disabled");
    currentAbortController = null;
    if (hoverInterval) {
      clearInterval(hoverInterval);
      hoverInterval = null;
      generateBtn.src = "gen-button.jpg";
    }
  }
});

// Random 6 Images Button
randomImagesBtn.addEventListener("click", () => {
  console.log("Random button clicked!");
  console.log("Current mode:", currentMode);

  if (currentMode !== "scene") {
    alert("Please switch to Scene Mode first!");
    return;
  }

  // Get selected quartier
  console.log("Current quartier:", currentQuartier);

  if (!currentQuartier) {
    alert("Please select a quartier first!");
    return;
  }

  const quartierNum = currentQuartier;
  const availableImages = quartierImages[quartierNum];
  console.log("Available images:", availableImages.length);

  if (availableImages.length === 0) {
    alert("No images available in the selected quartier!");
    return;
  }

  // First, clear all existing images from scene
  const containers = document.querySelectorAll(".image-container");
  containers.forEach(container => {
    container.remove();
  });

  // Update the quartierImages array to mark elements as not in scene
  for (let i = 1; i <= 20; i++) {
    quartierImages[i].forEach(img => {
      img.element = null;
    });
  }

  // Get 6 random images (or less if not enough available)
  const numImages = Math.min(6, availableImages.length);
  const shuffled = [...availableImages].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, numImages);
  console.log("Selected images:", selected);

  // Get window dimensions
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const margin = 150;
  const minX = margin;
  const maxX = windowWidth - margin;
  const minY = margin;
  const maxY = windowHeight - margin;

  // Add selected images to scene
  selected.forEach((imgData, index) => {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    console.log(`Creating image ${index + 1}:`, imgData.url, "at", x, y);

    createDraggableImage(imgData.url, imgData.caption, quartierNum, {
      x,
      y,
      scale: 1,
      zIndex: imageZIndex++
    });
  });

  // NICHT speichern - das würde alle anderen Bilder überschreiben!
  // saveImagePositions();
});

// Normalize Size Button
normalizeSizeBtn.addEventListener("click", () => {
  if (currentMode !== "scene") {
    alert("Please switch to Scene Mode first!");
    return;
  }

  const containers = document.querySelectorAll(".image-container");

  if (containers.length === 0) {
    alert("No images in the scene!");
    return;
  }

  const standardScale = 1;

  containers.forEach(container => {
    container.dataset.scale = standardScale;
    container.style.pointerEvents = "none";

    gsap.to(container, {
      scale: standardScale,
      duration: 0.5,
      ease: "power2.out",
      onComplete: () => {
        container.style.pointerEvents = "auto";
      }
    });
  });

  setTimeout(() => {
    saveImagePositions();
  }, 600);
});

// Apply random tilt to all buttons on page load
function applyRandomTiltToButtons() {
  const buttons = document.querySelectorAll('button, .generate-btn, .upload-preview-combined');

  buttons.forEach(button => {
    // Generate random rotation between -4 and 4 degrees
    const randomRotation = (Math.random() * 8 - 4).toFixed(2);
    button.style.transform = `rotate(${randomRotation}deg)`;
  });
}

// Apply tilt when page loads
applyRandomTiltToButtons();

// Debug: Check if buttons are found
console.log("clearSceneBtn:", clearSceneBtn);
console.log("randomImagesBtn:", randomImagesBtn);
console.log("normalizeSizeBtn:", normalizeSizeBtn);
