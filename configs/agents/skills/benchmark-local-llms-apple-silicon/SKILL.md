---
name: "benchmark-local-llms-apple-silicon"
description: "Benchmark local GGUF/MLX models for agentic coding on Apple Silicon (speed + tool-calling), incl. diffusion LMs and verifying suspicious HF model claims."
version: 1
created: "2026-06-16"
updated: "2026-06-16"
---
## When to Use
User asks which local model is best for agentic coding on a Mac, or to test/compare specific Hugging Face models (incl. hyped community distills with names like "qwopus"/"fable5"/MTP/diffusion). Use to get measured speed + capability numbers instead of trusting model-card claims.

## Procedure
1. Get hardware: sysctl -n machdep.cpu.brand_string; system_profiler SPHardwareDataType (RAM) and SPDisplaysDataType (GPU cores). Sizing rule: MoE with small active params (e.g. 3B) >> dense of same total params for tok/s; Q4_K_M of a ~30B fits in ~18GB.
2. Verify the repos are real BEFORE downloading: curl -s -o /dev/null -w '%{http_code}' https://huggingface.co/api/models/<repo>. Control test: fabricated repo names must return 401/404 while targets return 200 (proves the API isn't mocked).
3. Read the actual model card (curl .../raw/main/README.md) and tree (api/models/<repo>/tree/main?recursive=true) for quant filenames+sizes. Watch for self-reported/inconsistent benchmarks, 'reasoning model' (CoT tax), hobbyist 'v1 if I get likes' tells.
4. Build llama.cpp: git clone --depth 1 https://github.com/ggml-org/llama.cpp; cmake -B build -DGGML_METAL=ON -DLLAMA_CURL=ON; cmake --build build -j --target llama-cli llama-server llama-bench llama-completion.
5. Download GGUFs with hf download <repo> <file> --local-dir models (resumable; smallest first).
6. Speed: ./build/bin/llama-bench -m model.gguf -ngl 999 -p 512 -n 128 -r 3 -> read pp512 (prompt) and tg128 (gen) t/s. Re-run to confirm; first run is warm-up.
7. Capability + tool-calling: ./build/bin/llama-server -m model -ngl 999 -c 4096 --jinja --port P; poll /health; POST /v1/chat/completions with a coding task and again with an OpenAI tools array; check message.tool_calls is present/valid and message.content (use reasoning_content + max_tokens>=800 for reasoning models so the <think> block doesn't eat the budget).
8. Diffusion LMs (e.g. diffusiongemma): not via llama.cpp turnkey. Use MLX: pip/uv mlx-vlm, hf download mlx-community/<model>-4bit, then mlx_vlm.generate --model <dir> --output-modality text --max-tokens N --temperature 0 --block-length 64 --max-denoising-steps 12 --prompt '...'. Tuning block-length/denoising-steps ~2x throughput.
9. Report a measured table (gen t/s, prompt t/s, RAM, coding-correct, tool-call-valid) and pick the winner on agent-loop fit (prompt-processing speed + reliable tool-calling + no forced CoT).

## Pitfalls
- Modern llama-cli is interactive/conversation-only and HANGS waiting on stdin; -no-cnv was removed. Use llama-server for tests, or llama-completion, and always wrap long runs in a watchdog: ( cmd & pid=$!; (sleep N; kill -9 $pid)& ; wait $pid ).
- Don't trust model-card benchmarks: they're self-reported and often inconsistent (card vs badge). Measure.
- Reasoning models return empty content under a small max_tokens because the <think> block consumes it; raise budget and inspect reasoning_content before concluding it failed.
- MTP in community GGUFs is usually NOT usable speculative decoding: llama.cpp needs a separate vocab-matched draft model (--spec-draft-hf); embedded MTP heads aren't auto-used, and ~2x speculation won't beat a 6x MoE advantage.
- mlx-vlm diffusion CLI is bleeding-edge: flags appear in --help but argparse rejects them unless placed before --prompt and with --output-modality text; --version may be broken. uv tool upgrade can shift the CLI under you.
- curl piping large JSON into context is blocked by some setups; write to a temp file then parse with python (or use ctx_execute).

## Verification
1. llama-bench prints a markdown table with non-zero pp512/tg128 t/s for each model.
2. llama-server /v1/chat/completions returns correct code AND a valid message.tool_calls for the tools request.
3. Diffusion model: mlx_vlm.generate prints 'Generation: N tokens, X tokens-per-sec' with correct code and no argparse error.
4. Winner chosen with measured numbers; earlier wrong claims (e.g. 'diffusion not runnable') corrected against evidence.