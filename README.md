# React + Vite

## Offline desktop setup

The app uses the local Kokoro-7M ONNX model and `af_msa` voice pack. PDF text extraction, phonemization, and speech synthesis run on your device; conversion does not call a network service.

Create the Python environment and install its inference dependencies once:

```powershell
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install -r python\requirements.txt
.venv\Scripts\python.exe -m spacy download en_core_web_sm
.venv\Scripts\python.exe -m pip install -r python\build-requirements.txt
```

## Desktop development

Run the app in Electron during development:

```sh
npm run desktop:dev
```

Build a Windows installer in `release/`:

```sh
npm run desktop:build
```

The installer includes a bundled Python worker, ONNX model, vocabulary, and voice pack. Generated 24 kHz WAV files save automatically to `Music/Aucove Audio`; Generate does not open a save dialog. Scanned PDFs without selectable text are not supported yet.

The Electron window uses a sandboxed renderer with context isolation enabled. Add future desktop capabilities through the preload bridge in `electron/preload.cjs` rather than exposing Node.js APIs to the React app.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
