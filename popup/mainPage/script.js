// This import must be at the top level of the module.
import { delete_value, get_stored_value, store_value } from "../module/storage.js";

// --- Function Definitions ---

/**
 * Initializes the global settings UI.
 */
const initializeGlobalSettings = async () => {
    const captchaUrlInput = document.getElementById('captcha-url');
    const saveButton = document.getElementById('save-settings-btn');

    // This check is still good practice.
    if (!captchaUrlInput || !saveButton) {
        console.error("Could not find settings UI elements (#captcha-url or #save-settings-btn).");
        return;
    }

    const captchaStorageKey = 'EASYKOREA_CAPTCHA_URL';

    // 1. Load the saved URL from storage.
    const savedUrl = await get_stored_value(captchaStorageKey);
    if (savedUrl) {
        captchaUrlInput.value = savedUrl;
        console.log('Loaded Captcha URL from storage:', savedUrl);
    }

    // 2. Add the click listener for the save button.
    saveButton.addEventListener('click', async () => {
        const newUrl = captchaUrlInput.value.trim();
        if (newUrl) {
            await store_value(captchaStorageKey, newUrl);
            alert('Captcha Solver URL saved!');
            console.log('Saved new Captcha URL to storage:', newUrl);
        } else {
            await delete_value(captchaStorageKey);
            alert('Captcha Solver URL cleared.');
        }
    });
};

/**
 * Loads and displays the list of auto-booking items from storage.
 */
const loadAutoBooking = async () => {
    let autoBooking = await get_stored_value("autoBooking");
    let listContainer = document.getElementById("list-booking");

    if (!autoBooking || autoBooking.length < 1) {
        listContainer.innerHTML = "No auto booking items configured.";
        return;
    }

    listContainer.innerHTML = '';

    autoBooking.forEach((booking, index) => {
        let concertItem = createConcertItem(booking, index);
        listContainer.appendChild(concertItem);
    });
};

// ... All your other functions (createConcertItem, openBookingUrl, etc.) remain unchanged ...
function createConcertItem(booking, index) {
    let div = document.createElement("div");
    div.classList.add("booking-item");
    div.setAttribute("data-index", index);

    let deleteButton = document.createElement("button");
    deleteButton.classList.add("delete-button");
    deleteButton.innerHTML = "✖";
    deleteButton.addEventListener("click", async(event) => {
        event.stopPropagation();
        let dataIndex = event.currentTarget.parentNode.getAttribute("data-index");
        await deleteConcertItem(dataIndex);
    });

    let concertInfo = document.createElement("div");
    concertInfo.classList.add("concert-info");
    let concertName = document.createElement("p");
    concertName.classList.add("concert-name");
    concertName.textContent = booking["concert-name"] || "";

    let concertId = document.createElement("p");
    concertId.textContent = `Concert ID: ${booking["concert-id"] || ""}`;

    let date = document.createElement("p");
    date.textContent = `Date: ${booking.date || ""}`;

    let time = document.createElement("p");
    time.textContent = `Time: ${booking.time || ""}`;

    let section = document.createElement("p");
    section.textContent = `Sections: ${Array.isArray(booking.section) ? booking.section.join(", ") : ""}`;

    concertInfo.appendChild(concertName);
    concertInfo.appendChild(concertId);
    concertInfo.appendChild(date);
    concertInfo.appendChild(time);
    concertInfo.appendChild(section);

    let platformImage = document.createElement("img");
    platformImage.classList.add("platform-image");
    platformImage.src = getPlatformImageSrc(booking.platform);
    platformImage.alt = booking.platform;

    div.appendChild(concertInfo);
    div.appendChild(platformImage);
    div.appendChild(deleteButton);

    div.addEventListener("click", () => {
        openBookingUrl(booking.platform, booking["concert-id"]);
    });

    return div;
}

function openBookingUrl(platform, concertId) {
    let url;
    switch (platform) {
        case "melon": url = `https://tkglobal.melon.com/performance/index.htm?langCd=EN&prodId=${concertId}`; break;
        case "yes24": url = `http://ticket.yes24.com/Pages/English/Perf/FnPerfDeail.aspx?IdPerf=${concertId}`; break;
        case "interpark": url = `https://www.globalinterpark.com/product/${concertId}?lang=en`; break;
        default: console.error("Unknown platform"); return;
    }

    if (typeof window.create === 'function') {
        window.create({url, incognito: true });
    } else {
        console.warn('window.create is not a function. Opening in a new tab instead.');
        window.open(url, '_blank');
    }
}

async function deleteConcertItem(index) {
    let autoBooking = await get_stored_value("autoBooking");
    if (!autoBooking || !autoBooking[index]) { return; }

    await delete_value(autoBooking[index]["concert-id"]);
    autoBooking.splice(index, 1);
    await store_value("autoBooking", autoBooking);
    await loadAutoBooking();
}

function getPlatformImageSrc(platform) {
    switch (platform) {
        case "melon": return "../../assets/melonticket_logo.png";
        case "yes24": return "../../assets/yes24_logo.png";
        case "interpark": return "../../assets/interpark_logo.png";
        default: return "";
    }
}


// --- Main Execution Block ---
// Because the <script> tag is at the end of the body, we can safely run our initialization
// code here without waiting for any other events.
console.log("DOM is ready. Initializing page scripts.");
initializeGlobalSettings();
loadAutoBooking();