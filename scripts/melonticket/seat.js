// ==UserScript==
// @name         Advanced Ticket Bot (Chrome Extension Version)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Automated ticket finder that loads settings from Chrome Storage, with user confirmation for seat selection.
// @author       You
// @match        *://*/* // Be more specific with your target website's URL pattern
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';

    // --- Configuration ---
    const CONFIG = {
        FRAME_ID: 'oneStopFrame',
        SEAT_MAP_CANVAS_ID: 'ez_canvas',
        CAPTCHA_IMG_ID: 'captchaImg',
        CAPTCHA_INPUT_ID: 'label-for-captcha',
        CAPTCHA_API_URL: 'http://127.0.0.1:5000/solve_captcha',
        UNAVAILABLE_SEAT_COLOR: '#DDDDDD',
        POLL_INTERVAL_MS: 100,
        POLL_TIMEOUT_MS: 30000,
        DEFAULT_NUM_SEATS: 1,
        HIGHLIGHT_STYLE: {
            stroke: 'red',
            strokeWidth: '10'
        }
    };

    // --- Core Helper Functions ---
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    async function waitForElement(selector, context = document, timeout = CONFIG.POLL_TIMEOUT_MS) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const element = context.querySelector(selector);
            if (element) return element;
            await sleep(CONFIG.POLL_INTERVAL_MS);
        }
        throw new Error(`Element with selector "${selector}" not found within ${timeout}ms.`);
    }

    async function load_global_settings() {
        const storageKey = 'EASYKOREA_CAPTCHA_URL';
        const savedUrl = await get_stored_value(storageKey);
        if (savedUrl) {
            CONFIG.CAPTCHA_API_URL = savedUrl;
            console.log(`Overrode Captcha URL with value from localStorage: ${savedUrl}`);
        } else {
            console.log(`Using default Captcha URL: ${CONFIG.CAPTCHA_API_URL}`);
        }
    }

    // --- Main Application Logic ---
    class TicketBot {
        constructor() {
            this.frame = null;
            this.frameDoc = null;
            this.mainDoc = document;
        }

        async initialize() {
            console.log("Starting robust initialization...");
            const startTime = Date.now();
            const timeout = CONFIG.POLL_TIMEOUT_MS;
            while (Date.now() - startTime < timeout) {
                const frameElement = this.mainDoc.getElementById(CONFIG.FRAME_ID);
                if (frameElement && frameElement.contentWindow && frameElement.contentWindow.document) {
                    const currentFrameDoc = frameElement.contentWindow.document;
                    const targetElement = currentFrameDoc.querySelector(".seat_name");
                    if (targetElement) {
                        console.log("Initialization complete. Iframe and its content are ready.");
                        this.frame = frameElement.contentWindow;
                        this.frameDoc = currentFrameDoc;
                        return true;
                    }
                }
                await sleep(CONFIG.POLL_INTERVAL_MS);
            }
            throw new Error(`Initialization failed. Could not find a loaded iframe with ".seat_name" within ${timeout}ms.`);
        }

        openEverySection() {
            console.log("Opening all sections...");
            const sections = this.frameDoc.getElementsByClassName("seat_name");
            if (sections.length > 0) {
                console.log(`Found ${sections.length} sections to open.`);
                for (const section of sections) {
                    section.parentElement.click();
                }
            } else {
                console.warn("No .seat_name elements found to click, proceeding anyway.");
            }
        }

        async confirmSeatSelection(block, sectionName) {
            const originalStyles = [];
            block.forEach(seatInfo => {
                const el = seatInfo.element;
                originalStyles.push({ stroke: el.style.stroke, strokeWidth: el.style.strokeWidth });
                el.style.stroke = CONFIG.HIGHLIGHT_STYLE.stroke;
                el.style.strokeWidth = CONFIG.HIGHLIGHT_STYLE.strokeWidth;
            });
            let userAccepted = false;
            try {
                userAccepted = window.confirm(
                    `Found ${block.length} adjacent seats in section: "${sectionName}".\n\n` +
                    `[OK] to select these seats.\n` +
                    `[Cancel] to find the next available option.`
                );
            } finally {
                console.log("Cleaning up seat highlighting...");
                block.forEach((seatInfo, index) => {
                    const el = seatInfo.element;
                    const original = originalStyles[index];
                    el.style.stroke = original.stroke;
                    el.style.strokeWidth = original.strokeWidth;
                });
            }
            return userAccepted;
        }

        async findAndClickSeat(numSeatsToFind, sectionName) {
            console.log(`Finding a block of ${numSeatsToFind} contiguous seat(s) in section "${sectionName}"...`);
            try {
                const canvas = await waitForElement(`#${CONFIG.SEAT_MAP_CANVAS_ID}`, this.frameDoc);
                const seats = canvas.getElementsByTagName("rect");
                if (seats.length === 0) { return false; }

                const seatRows = new Map();
                for (const seat of seats) {
                    const fillColor = seat.getAttribute("fill");
                    if (fillColor && fillColor.toLowerCase() !== CONFIG.UNAVAILABLE_SEAT_COLOR.toLowerCase() && fillColor !== "none") {
                        const y = seat.getAttribute("y");
                        const x = parseFloat(seat.getAttribute("x"));
                        if (!seatRows.has(y)) seatRows.set(y, []);
                        seatRows.get(y).push({ element: seat, x: x });
                    }
                }
                if (seatRows.size === 0) { return false; }

                const sortedRowKeys = Array.from(seatRows.keys()).sort((a, b) => parseFloat(a) - parseFloat(b));
                for (const yKey of sortedRowKeys) {
                    const rowSeats = seatRows.get(yKey);
                    if (rowSeats.length < numSeatsToFind) continue;
                    rowSeats.sort((a, b) => a.x - b.x);

                    const seatWidth = parseFloat(rowSeats[0].element.getAttribute('width'));
                    const maxAllowedGap = seatWidth * 1.5;

                    for (let i = 0; i <= rowSeats.length - numSeatsToFind; i++) {
                        const potentialBlock = rowSeats.slice(i, i + numSeatsToFind);
                        let isContiguous = true;
                        for (let j = 0; j < potentialBlock.length - 1; j++) {
                            if ((potentialBlock[j + 1].x - potentialBlock[j].x) > maxAllowedGap) {
                                isContiguous = false;
                                break;
                            }
                        }

                        if (isContiguous) {
                            const userAccepted = await this.confirmSeatSelection(potentialBlock, sectionName);
                            if (userAccepted) {
                                console.log("User accepted. Selecting seats and proceeding...");
                                potentialBlock.forEach(seat => seat.element.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })));
                                this.frameDoc.querySelector(`#${CONFIG.NEXT_BUTTON_ID}`)?.click();
                                return true;
                            } else {
                                console.log("User rejected. Searching for next available block...");
                            }
                        }
                    }
                }
                return false;
            } catch (error) {
                console.error("Error during findAndClickSeat:", error);
                return false;
            }
        }

        async search(data, numSeats) {
            console.log(`Starting search for ${numSeats} seat(s).`);
            const captchaPromise = this.solveCaptcha();
            this.openEverySection();
            await sleep(500);

            let sectionsToSearch = data?.section;
            if (!sectionsToSearch || !sectionsToSearch.length) {
                sectionsToSearch = await this.getSectionList();
            }
            if (!sectionsToSearch.length) {
                console.error("No sections to search. Aborting run.");
                return;
            }

            for (const sectionName of sectionsToSearch) {
                const didClick = await this.clickOnArea(sectionName);
                if (!didClick) {
                    console.warn(`Skipping search in section "${sectionName}" as it could not be clicked.`);
                    continue;
                }
                await sleep(250);

                const isSeatFoundAndAccepted = await this.findAndClickSeat(numSeats, sectionName);

                if (isSeatFoundAndAccepted) {
                    console.log("Seat block accepted! Waiting for captcha to be filled...");
                    const captchaFilled = await captchaPromise;
                    if (!captchaFilled) {
                        console.error("FAILED: Seats were selected, but captcha could not be filled.");
                    }
                    return;
                } else {
                    console.log(`Finished searching section "${sectionName}". No acceptable seats were found.`);
                }
            }
            console.log(`Search complete. No available seats were found and accepted in any section.`);
        }

        async clickOnArea(areaName) {
            console.log(`Attempting to click on area: "${areaName}"`);
            try {
                await waitForElement(".area_tit", this.frameDoc);
                const areaTitles = this.frameDoc.getElementsByClassName("area_tit");
                const areaRegex = new RegExp(areaName + "$", "g");
                for (const title of areaTitles) {
                    if (title.innerHTML.match(areaRegex)) {
                        title.parentElement.click();
                        console.log(`Successfully clicked on area: "${areaName}"`);
                        return true;
                    }
                }
                console.warn(`Area named "${areaName}" was not found in the list.`);
                return false;
            } catch (error) {
                console.error(`Error trying to find or click on area "${areaName}":`, error);
                return false;
            }
        }
        async getSectionList() {
            console.log("Auto-detecting available sections...");
            try {
                await waitForElement(".area_tit", this.frameDoc);
                const sections = Array.from(this.frameDoc.getElementsByClassName("area_tit")).map(el => el.innerText.trim());
                console.log('Available sections found:', sections);
                return sections;
            } catch (error) { console.error("Could not get section list.", error); return []; }
        }
        async solveCaptcha() {
            try {
                const captchaImg = await waitForElement(`#${CONFIG.CAPTCHA_IMG_ID}`);
                const captchaImageString = captchaImg.getAttribute("src");
                if (!captchaImageString) { console.warn("Captcha image source not found."); return false; }
                const response = await fetch(CONFIG.CAPTCHA_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_data: captchaImageString })
                });
                if (!response.ok) console.error(`Captcha API failed with status: ${response.status}`);
                const result = await response.json();
                const captchaText = result.text;
                console.log('Captcha solved by API:', captchaText);
                const captchaInput = this.mainDoc.getElementById(CONFIG.CAPTCHA_INPUT_ID);
                if (captchaInput && captchaText) {
                    captchaInput.focus();
                    captchaInput.value = captchaText;
                    console.log("Captcha input field filled.");
                    return true;
                } else { console.warn("Captcha input field not found after solving."); return false; }
            } catch (error) {
                console.error('Error solving or filling captcha:', error, 'Please fill manually.');
                return false;
            }
        }
    }

    // --- Script Entry Point ---
    async function main() {

        await load_global_settings();

        // The key used for storage will be the concert's product ID.
        const storageKey = document.getElementById("prodId")?.value;
        const storedValueData = await get_stored_value(storageKey); // Ensure it's an object

        const userData = {
            numSeats: storedValueData.ticket ?? CONFIG.DEFAULT_NUM_SEATS,
            section: storedValueData.section ?? []
        };

        console.log("TicketBot script starting with settings:", JSON.stringify(userData));
        const bot = new TicketBot();
        const isReady = await bot.initialize();

        if (isReady) {
            try {
                await bot.search(userData, userData.numSeats);
            } catch (error) {
                console.error("An unexpected error occurred during the main search process:", error);
            }
        }
    }

    main();

})();