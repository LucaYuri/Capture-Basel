export const config = {

    // Gemini settings
    geminiPrompt: "Look at this image carefully. What is the most prominent element or subject that you can see? Use a generic term, never brand names. For example: say 'boardgame' not 'Monopoly', 'car' not 'Tesla', 'building' or 'church' for architectural structures, 'sculpture' for abstract art objects. Answer with exactly ONE generic word only. No explanations, no brand names, just one simple word.",
    
    // Workflow settings
    workflow_id: "workflows/kratadata/segment-prompt-style", //keep this as is
    guidance_scale: 5.0, //choose how much the model should adhere to the prompt
    prompt: "Generate the object in the style of SK3TCHING on a white background. Use only white background and red marker pen.",
    lora_scale: 1.3, //choose how much the lora should influence the generation
    lora_path: "kratadata/red-marker", //this needs to be changed to the correct lora path 

    // Server settings
    port: 3000,
    
    // File upload limits
    max_file_size: 10 * 1024 * 1024, //user can upload an image up to 10MB

};

