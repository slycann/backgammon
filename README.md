# Backgammon

Play backgammon against the computer in your browser. You play white; the computer plays black.

Open `index.html` in a browser, no build step needed. It also works as-is on GitHub Pages.

- `engine.js`: rules (entering from the bar, hitting, bearing off, the must-play-both-dice and higher-die rules, gammons) and the computer opponent (Easy / Medium / Hard)
- `app.js`: board drawing (SVG), clicks, turn flow, score saved in the browser
- `test/engine.test.js`: rules tests plus 60 simulated computer-vs-computer games; run with `node test/engine.test.js`

Not yet included: doubling cube, match play, animations.
