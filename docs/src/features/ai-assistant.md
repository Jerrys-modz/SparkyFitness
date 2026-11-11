## Sparky Buddy (AI Assistant)
### Core AI Features
- **Food Recognition**: Analyze food photos for automatic logging and nutrition extraction
- **Nutrition Analysis**: Intelligent nutrition information extraction from text and images
- **Meal Suggestions**: AI-powered meal recommendations and recipe generation
- **Question Answering**: General nutrition and fitness guidance, personalized advice
- **Exercise Logging**: Log exercises with duration, distance, and calorie estimates
- **Measurement Logging**: Log standard and custom body measurements
- **Water Intake Logging**: Track daily water consumption
- **Calorie target review**: Ask whether your calorie target is right. The assistant compares the target with your estimated maintenance (the same adaptive estimate as the Goals screen) and your weight trend, and gives the calories for the weekly change you want. It never lowers a target below the safe minimum and changes your goal only after you agree.
- **Training, run and plan reviews**: See [Adaptive coaching](/features/exercises/adaptive-coaching) for the strength and run reviews and for plan weight changes.

### Chat Interface
- **Image Upload**: Send photos for food analysis
- **Text Input**: Natural language food descriptions, questions, and commands
- **History**: Persistent chat conversation history with session grouping
- **Metadata Storage**: Stores structured data like food options, exercise suggestions within chat history
- **Settings**: Direct access to AI service configuration

### Voice input on web and mobile

In **Ask Sparky** on the web, Android, or iOS, tap the microphone, dictate a message, then stop recording. Review or edit the recognized text and tap **Send**. Dictation does not automatically send messages or add food to your diary; the existing chat handles your request after you send it.

Open **Settings → Developer & Integrations → AI Service Settings → Voice input** on the web, or **Settings → Voice settings** on mobile. The server stores these settings for both clients; reopening the screen or returning to the app/browser refreshes changes made elsewhere.

- **Voice input On/Off:** turning it off hides the microphone without clearing your selected model. Voice input is on by default, using System recognition.
- **System recognition (default):** uses the device or browser speech recognizer without a Sparky AI transcription charge. Microphone/speech permission is required. Availability, languages, offline support, and whether audio is processed by a cloud service depend on your device or browser. Some browsers and embedded webviews do not support this mode; the chat offers Voice settings, never an automatic switch to AI.
- **Optional AI transcription:** first enable audio input on a compatible configuration in the web app's AI Service Settings. Under Voice input, choose **AI transcription**, then explicitly select a **Voice model**. A compatible Chat configuration is suggested first, not automatically selected. Provider charges may apply. Voice is independent of the **Chat** and **Vision** selections; choose **System (default)** to return to system recognition.
- **Supported AI transports:** Google models accepting inline audio, or OpenAI, Mistral, and compatible `/audio/transcriptions` endpoints. Choose a transcription-capable model, not an ordinary text-chat model. OpenAI-compatible/custom endpoints can omit the API key when the server does not require one.
- **Privacy and limits:** AI mode sends the recording through your SparkyFitness server to the selected provider. Uploads are limited to 10 MB; the server buffers audio in memory and does not save audio in chat history. Temporary device recordings are deleted after completion or cancellation; browser recordings stay in memory and microphone tracks are stopped. Provider-side retention follows that provider's policy.
- **Foreground only:** leaving the chat, switching browser tabs, backgrounding the app, disabling voice, or changing recognition mode cancels capture/transcription. The web also supports Cancel and Escape. Sending and editing are temporarily disabled during capture/transcription so a late result cannot overwrite another message. Failed recognition leaves the existing draft intact.
- **Browser requirements:** microphone recording requires HTTPS (or localhost for development), microphone permission, and a supported MediaRecorder format. WebM/Opus, MP4, and Ogg/Opus are supported when offered by the browser. A missing recognizer or denied permission never enables a paid provider automatically.

AI transcription requires an updated client and server, with the database migrations applied. Native microphone/speech-recognition dependencies require a rebuilt mobile app, not just an over-the-air JavaScript update.

### Food Integration
- **Auto-Logging**: Directly add recognized foods to diary with confirmation
- **Nutrition Confirmation**: Review and edit AI suggestions before logging
- **Meal Context**: Understand meal timing and context for accurate logging
- **Brand Recognition**: Identify specific food brands and products

## Food Preferences and Saved Tasks

The web chat's **Food preferences and tasks** panel shows lasting food preferences and saved work. Tell Sparky explicitly what to remember, or edit and forget preferences in the panel. A choice for one meal does not replace a lasting preference. These preferences are stored separately from conversation history.

Multi-step food tasks keep their ingredient selections, portion variants, source evidence and next step. Ingredients that still need matching remain in the draft with incomplete nutrition. Saving a draft does not publish a recipe or add food to the diary. Select a task to inspect its checkpoint and operation history, cancel remaining work, or resume it in chat. Resume does not start a background job.

This information belongs to the signed-in person and is not shared with family diary viewers.

## What Sparky Remembers

Sparky can keep a short list of things you told it about yourself: your diet, allergies, foods you avoid, goals, or how you like to be coached. It keeps to them in every chat and in the daily summary, on web and mobile.

- **Add something**: tell Sparky in chat ("Remember that I am vegetarian"), or type it in yourself. On the web open **Settings > AI Service > What Sparky remembers**; in the mobile app open **Settings > What Sparky remembers**.
- **Change or delete**: use the same screen. Each item can be edited or deleted on its own.
- **Turn it off**: switch off **Let Sparky use this**. The list is kept, but Sparky stops reading it and stops adding to it until you switch it back on.

This is what you said about yourself, kept apart from what you log. Sparky is told not to assume anything beyond it, and a request in the current message always wins for that message. The list is private to you and is never shared with family.

## Coaches

A coach is Sparky with a focus. Choosing one adds that coach's instructions to the chat and limits the chat to the tools the coach needs, so a coach only reaches the data its job calls for. One coach is active at a time. Each coach keeps its own conversation: choosing a coach shows what you and that coach said before, a coach only sees its own conversation, and clearing the chat clears only the conversation shown.

Four coaches are built in:

- **Recovery Coach** connects your training with what you eat and how you rest.
- **Consistency Coach** helps you keep habits going and restart gently after a gap.
- **Macro Timing Coach** looks at when you eat protein and carbs around your workouts.
- **Sleep and Recovery Coach** compares your sleep with your training load.

To choose one, use the coach button in the web chat composer, or the coach chip above the chat in the mobile app. Choose **Sparky** to go back to the general assistant with every tool.

You can add up to 20 coaches of your own: give each a name, instructions (what to focus on and how to talk to you) and the tools it may use. On the web open **Settings > AI Service > Your coaches**; in the mobile app open **Settings > Coaches**. A coach cannot read or change anything outside the tools you gave it. If you also trim tools in the chat's tool selector, the coach gets only the tools both allow.

Your coaches are private to you and are never shared with family. What Sparky remembers applies to every coach.

### Coach check-ins

Coaches normally answer when you ask. With check-ins on, some of them also leave you a short message when there is something worth saying. Check-ins are off until you turn them on: on the web under **Settings > AI Service > Coach check-ins**, in the mobile app under **Settings > Coaches**.

Once a day, from the hour you choose, the server looks at your finished days and each coach you switched on may leave one message:

| Coach | Speaks up when |
|---|---|
| Recovery Coach | You logged a workout yesterday, logged food, and protein was under 80% of your goal |
| Sleep and Recovery Coach | Last night was under 6 hours and you logged 2 or more workouts in the 3 days before |
| Consistency Coach | You have not logged for 2 days, and once more at 5 days; or a logging streak reaches 3, 7, 14, 30, 60, 100, 200 or 365 days |

The Macro Timing Coach and your own coaches do not check in yet.

Things to know:

- Active calories synced from a watch are a daily energy total, not a workout, and do not count as training or as logging.
- You get at most 2 messages a day, a coach does not repeat the same observation for a few days, and something you did not log is treated as unknown, never as zero.
- Messages appear at the top of the web Diary and in a "From your coaches" card on the mobile Dashboard. From a message you can dismiss it or open the chat as that coach. Messages are deleted after 30 days.
- **Wording**: by default a message is a ready-made sentence with your numbers in it, and no AI request is made. Switch on **Let my AI service word them** to have your AI service write each one; that is one background request to your AI service per message.
- **Notifications**: the mobile app has no server push. With **Notify me on this phone** on, a new message raises a notification the next time the app syncs in the background, so it can arrive some time after it was written. It needs notifications and background sync to be on.
- **Check now** runs today's check straight away, under the same rules and daily limit.

## Daily Summary

Sparky can write a short summary of your day so far with one or two optional suggestions, based on the food, exercise and water you logged today and yesterday, your goals, and what Sparky remembers.

It is off until you turn it on, because each new summary is one request to your own AI service:

- **Mobile**: **Settings > Dashboard**, switch on **Sparky's daily summary**. The card appears on the Dashboard for today.
- **Web**: **Settings > AI Service > What Sparky remembers**, switch on **Daily summary on the Diary**. The card appears at the top of the Diary for today. This switch applies to that browser only.

A summary is kept for three hours, so reopening the app does not use your AI service again. Use the refresh button on the card to write a new one sooner. No request is made when no AI service is set up or when nothing was logged today or yesterday. The summary is not stored on the server and is not shown while you view a family member's data.

## Troubleshooting AI Providers

Most "OpenAI Compatible / OpenRouter isn't working" reports come from provider configuration, not from SparkyFitness itself. The most common cases:

### OpenRouter: "No allowed providers are available for the selected model" (HTTP 404)

This is an **OpenRouter account setting**, not a SparkyFitness error. OpenRouter serves each model through one or more upstream providers. If your account is restricted to a subset of providers, a model whose upstream is excluded fails with this 404 — this most often hits the free (`:free`) models, which run on providers you may not have enabled.

The error body shows the mismatch directly:

- `available_providers` — the providers that can actually serve the model
- `requested_providers` — the providers your account currently allows

**Fix:** In your OpenRouter account settings, review the allowed-providers / data-policy preferences, then either enable the provider that serves your chosen model **or** pick a model served by a provider you already allow (e.g. an `openai/`, `anthropic/`, or `google/` model if those are your allowed upstreams).

### Every request 404s (doubled URL)

If your custom URL already ends in `/chat/completions`, SparkyFitness appends its own path and the request 404s.

**Fix:** Enter only the base URL ending in `/v1` — for example `https://openrouter.ai/api/v1`. For local servers such as LM Studio or Ollama, use an admin/global AI setting or enable [`ALLOW_PRIVATE_NETWORK_AI=true`](/install/environment-variables) on a trusted self-hosted deployment. SparkyFitness adds `/chat/completions` for you.

### "Model not found" or empty/garbled responses

The model name must be one your endpoint actually hosts. OpenAI names like `gpt-4o-mini` will not exist on most compatible servers.

**Fix:** For the **OpenAI Compatible** and **Custom** service types, enable **Use custom model** and enter your server's own model name.

### Chat works, but photo analysis or label scan fails

Food-photo analysis and nutrition-label scanning request **structured JSON output**; plain chat does not. This is done to improve the quality of results. Some models and servers do not support structured output and reject those requests while chat still works.

**Fix:** Choose a model that supports structured outputs / JSON mode. On OpenRouter, a model's page lists whether it supports "structured outputs".

### Local servers (LM Studio, Ollama, llama.cpp)

These usually run without an API key — leave the **API Key** field blank. Use the OpenAI-compatible base URL the server exposes, for example `http://localhost:1234/v1` (LM Studio) or `http://localhost:11434/v1` (Ollama's OpenAI-compatible endpoint).

Local/private AI URLs are resolved from the backend server's network, not from the browser. To prevent regular users from turning the server into a private-network proxy, private AI URLs are allowed for current admins, global admin-created AI settings, or deployments that explicitly set [`ALLOW_PRIVATE_NETWORK_AI=true`](/install/environment-variables).

### Perplexity AI Setup and Troubleshooting

Perplexity has retired the legacy OpenAI-compatible Chat Completions API (`/v1/chat/completions` and `/v1/sonar`) in favor of their new Agent API (`/v1/responses`). Attempting to connect to `api.perplexity.ai` under the generic **OpenAI Compatible** type returns HTTP 403 `chat_completions_not_available`.

**How to use Perplexity models in SparkyFitness:**

1. **Direct Perplexity Setup (Recommended):**
   - In **AI Settings**, select **Perplexity AI** from the provider dropdown.
   - Enter your Perplexity API key from `console.perplexity.ai`.
   - Select your preferred preset tier (`fast`, `low`, `medium`, `high`, `xhigh`) or enter a custom model. SparkyFitness automatically connects to Perplexity's Agent API (`/v1/responses`) using the appropriate preset.

2. **Via OpenRouter (Alternative):**
   - In **AI Settings**, select **OpenRouter** as the provider.
   - Enter your OpenRouter API key.
   - Select `perplexity/sonar` or `perplexity/sonar-pro` from the model presets. OpenRouter translates requests into standard chat completions.

### Running the chatbot on small local models (Ollama)

Small local models (roughly 3B–8B, e.g. an 8 GB Mac) can drive the chatbot's tools well, but two settings make the difference between "works great" and "acts dumb":

1. **Raise Ollama's context window.** Ollama defaults to a 4096-token context and **silently truncates** anything longer — which chops the tool definitions and system prompt mid-way and produces wrong or malformed tool calls. Raise it before anything else:
   - Set `OLLAMA_CONTEXT_LENGTH=16384` on the Ollama server (e.g. `launchctl setenv OLLAMA_CONTEXT_LENGTH 16384` on macOS, then restart Ollama), **or**
   - Bake `PARAMETER num_ctx 16384` into a Modelfile (`ollama create my-model -f Modelfile`) and point the service at that model.
   - On an 8 GB machine, start at `8192` — context uses VRAM — and only go higher if responses stay fast.
2. **Use the `core` tool profile.** When you add an Ollama service, SparkyFitness now preselects the **core** tool profile (in the service's settings). Core exposes the everyday logging tools plus goals (~20 tools) instead of the full ~35, which small models select from far more reliably and which fits a smaller context window. Pick **full** only on a strong local machine with a raised context window.

The server logs a warning when an Ollama service runs the `full` profile, since that combination most often overflows the default context. Also prefer models trained for tool calling (e.g. `qwen2.5:7b-instruct`, `llama3.1:8b`) — plain small chat models make unreliable tool calls.
