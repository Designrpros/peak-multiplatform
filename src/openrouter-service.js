// src/openrouter-service.js

const axios = require('axios');
const API_BASE = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Sends a chat completion request to OpenRouter with streaming enabled.
 * @param {string} model The model ID (e.g., "openai/gpt-4o-mini").
 * @param {Array<Object>} messages The conversation history.
 * @param {string} apiKey The OpenRouter API key.
 * @param {string} referer The site URL for attribution.
 * @param {string} title The site title for attribution.
 * @returns {Promise<NodeJS.ReadableStream>} A promise that resolves to a readable stream of API chunks.
 */
function streamChatCompletion(model, messages, apiKey, referer, title) {
    if (!apiKey) {
        // Return a promise that rejects if the API key is missing
        return Promise.reject(new Error("OpenRouter API key is not configured. Please check your .env file in main.js."));
    }

    // Convert the message array to the format expected by the API
    const payload = {
        model: model,
        messages: messages,
        stream: true, // Crucial for streaming response
        temperature: 0.7, // Lower for Gemini stability (1.0 can cause empty responses)
        max_tokens: 8192, // Generous token limit
        top_p: 0.9, // Better sampling for Gemini
        include_reasoning: true, // Enable thinking/reasoning for supported models
    };

    console.log('[OpenRouter] Request payload:', JSON.stringify({
        model: payload.model,
        messageCount: payload.messages.length,
        temperature: payload.temperature,
        max_tokens: payload.max_tokens,
        firstMessage: payload.messages[0]?.role,
        lastMessage: payload.messages[payload.messages.length - 1]?.role,
        systemPromptLength: payload.messages[0]?.content?.length || 0
    }, null, 2));

    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Optional attribution headers for OpenRouter leaderboards
        'HTTP-Referer': referer,
        'X-Title': title,
    };

    console.log(`[OpenRouter Service]: Streaming request started for model: ${model}`);

    // Use axios to make the streaming POST request
    return axios.post(API_BASE, payload, {
        headers: headers,
        responseType: 'stream', // Ensure axios treats the response as a stream
    }).then(response => {
        // Return the raw readable stream from the response data
        return response.data;
    }).catch(error => {
        if (error.response) {
            const status = error.response.status;
            let errorMessage = `API Error: ${status}`;
            if (status === 401) {
                errorMessage = "API Error: Invalid OpenRouter API key or missing headers.";
            } else if (status === 429) {
                errorMessage = "API Error: Rate limit exceeded.";
            } else if (error.response.data && error.response.data.pipe) {
                // Attempt to read the error body from the stream
                return new Promise((_, reject) => {
                    let data = '';
                    error.response.data.on('data', chunk => data += chunk);
                    error.response.data.on('end', () => {
                        try {
                            const errorJson = JSON.parse(data);
                            reject(new Error(`API Error: ${errorJson.error?.message || errorJson.message || errorMessage}`));
                        } catch {
                            reject(new Error(`API Error: ${errorMessage} - ${data.toString().substring(0, 50)}...`));
                        }
                    });
                });
            }
            return Promise.reject(new Error(errorMessage));
        } else if (error.request) {
            return Promise.reject(new Error("Network Error: No response received from OpenRouter."));
        } else {
            return Promise.reject(new Error(`Request Setup Error: ${error.message}`));
        }
    });
}

module.exports = {
    streamChatCompletion
};