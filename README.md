# Image Workflow

A simple black and white web application for generating images using fal.ai workflow API with AI-powered object detection.

## Features

- **Automatic Object Detection**: Uses Google's Gemini 2.5 Flash to automatically identify the most prominent object in your uploaded image
- **AI-Powered Segmentation**: Automatically segments and styles the detected object using LoRA
- **Real-time Progress**: Shows step-by-step progress from image analysis to final generation

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the project root with your API keys:
```bash
FAL_KEY=your_fal_api_key_here
REPLICATE_API_TOKEN=your_replicate_api_token_here
```

Get your API keys from:
- FAL API Key: https://fal.ai/dashboard/keys
- Replicate API Token: https://replicate.com/account/api-tokens

3. Start the server:
```bash
npm start
```

4. Open your browser to `http://localhost:3000`

## Usage

1. Upload an image using the file input on the left side
2. Click "Generate" button
3. Gemini AI will automatically detect the most prominent object in your image
4. Wait for the image to be generated (progress bar will show on the right side)
5. Generated images are saved in `/gen-images` folder

## Project Structure

- `public/` - Frontend files (HTML, CSS, JavaScript)
- `server.js` - Express backend server with fal.ai and Replicate/Gemini integration
- `config.js` - Configuration for workflow parameters
- `lora/` - LoRA model files for styling
- `gen-images/` - Generated images are saved here
- `uploads/` - Temporary storage for uploaded images

## How It Works

1. **Upload**: You upload an image through the web interface
2. **Analysis**: The image is sent to Google's Gemini 2.5 Flash API which analyzes it and returns a one-word description of the most prominent object
3. **Segmentation**: The detected object name is used as the text prompt for the segmentation workflow
4. **Styling**: The segmented object is rendered in the SK3TCHING style (red marker on white background)
5. **Result**: The final stylized image is displayed and saved locally

