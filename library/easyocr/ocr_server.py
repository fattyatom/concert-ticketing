import base64
import re
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import easyocr # We return to the reliable EasyOCR engine

# --- Configuration ---
ALLOWLIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

# --- Initialization ---
# Initialize the EasyOCR reader once for performance.
print("Initializing EasyOCR...")
reader = easyocr.Reader(['en'], gpu=True)
print("EasyOCR Initialized.")

app = Flask(__name__)
CORS(app, origins=['http://localhost:5000', 'https://tkglobal.melon.com'])

# ==============================================================================
#      THE UNIFIED PREPROCESSING PIPELINE (This is perfect and remains unchanged)
# ==============================================================================
def preprocess_image_unified(image_bytes):
    # This entire function is correct and has been battle-tested by you.
    image_np = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(image_np, cv2.IMREAD_UNCHANGED)
    if img is None: return None
    if len(img.shape) > 2 and img.shape[2] == 4:
        background = np.full((img.shape[0], img.shape[1], 3), (255, 255, 255), dtype=np.uint8)
        alpha = img[:, :, 3]
        bgr = img[:, :, :3]
        alpha_mask = cv2.cvtColor(alpha, cv2.COLOR_GRAY2BGR).astype(np.float32) / 255.0
        foreground = cv2.multiply(alpha_mask, bgr.astype(np.float32))
        bg = cv2.multiply(1.0 - alpha_mask, background.astype(np.float32))
        img = cv2.add(foreground, bg).astype(np.uint8)
    gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, binary_img = cv2.threshold(gray_img, 128, 255, cv2.THRESH_BINARY_INV)
    line_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    detected_line = cv2.morphologyEx(binary_img, cv2.MORPH_OPEN, line_kernel, iterations=2)
    img_no_line = cv2.subtract(binary_img, detected_line)
    contours, _ = cv2.findContours(img_no_line, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    mask = np.zeros_like(img_no_line)
    min_contour_area = 3
    for contour in contours:
        if cv2.contourArea(contour) > min_contour_area:
            cv2.drawContours(mask, [contour], -1, 255, thickness=cv2.FILLED)
    img_no_noise = mask
    repair_kernel = np.ones((3,3), np.uint8)
    repaired_img = cv2.morphologyEx(img_no_noise, cv2.MORPH_CLOSE, repair_kernel)
    final_img = cv2.bitwise_not(repaired_img)
    cv2.imwrite("../../scripts/local-ocr/debug_final_for_ocr.png", final_img)
    return final_img

# ==============================================================================
#      FLASK API ENDPOINT (Using the reliable EasyOCR Engine)
# ==============================================================================
@app.route('/solve_captcha', methods=['POST'])
def solve_captcha():
    try:
        data = request.get_json()
        if not data or 'image_data' not in data:
            return jsonify({'error': 'Missing or invalid image_data in JSON payload'}), 400

        base64_string = data['image_data']
        if "," in base64_string: _, encoded = base64_string.split(",", 1)
        else: encoded = base64_string

        image_bytes = base64.b64decode(encoded)
        processed_image = preprocess_image_unified(image_bytes)

        if processed_image is None:
            return jsonify({'error': 'Failed to process image'}), 500

        # --- THIS IS THE RELIABLE EASYOCR ENGINE CALL ---
        result = reader.readtext(
            processed_image,
            detail=0,
            allowlist=ALLOWLIST,
            paragraph=False
        )

        print(f"Raw EasyOCR Result: {result}")

        if result:
            raw_text = "".join(result)
            solved_text = re.sub(f'[^{ALLOWLIST}]', '', raw_text.replace(" ", "")).upper()
        else:
            solved_text = ""

        print(f"Final Solved Text: {solved_text}")
        return jsonify({'text': solved_text})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'An internal server error occurred', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)