# Acknowledgments

This project relies on the following open-source tools and databases. Their quality and availability are the only reason this tracker exists.

I just want to say thank you to all of you.

### Stockfish
Used for move evaluation and engine continuations. It remains the gold standard for chess engines and a masterclass in open-source performance.
* [https://stockfishchess.org/](https://stockfishchess.org/)

### Lichess.org
Used for game data and API services. An unrivaled platform that provides the "oxygen" for modern chess development by keeping data free and accessible.
* [https://lichess.org/](https://lichess.org/)

### Lichess scalachess and move-quality conventions

The phase divider is a TypeScript port of
[scalachess Divider.scala](https://github.com/lichess-org/scalachess/blob/736daea6b3fc3dddebbc69f3bd8463dc13cc198a/core/src/main/scala/Divider.scala).
Its MIT [permission notice](../../web/public/licenses/scalachess-MIT.txt) ships
with the app. Badge mistakes and blunders independently implement the numerical
winning-chance and mate-transition conventions in pinned
[Lichess Advice.scala](https://github.com/lichess-org/lila/blob/7245313a7b6fb39491e2c2c172cecfea268fc72d/modules/tree/src/main/Advice.scala),
with inaccuracies deliberately ignored. See the
[qualification reference](badge-rules.md) for their use and limits.

### Norman Pollock (40H-PGN)
Used during the Python opening-analysis prototype. Norman’s meticulous work cleaning and filtering high-level OTB games into the 40H-PGN databases is an essential resource for opening analysis.
* [http://nk-qy.info/40h](http://nk-qy.info/40h)

### Niklas Fiekas (python-chess)
The earlier Python prototype used this library for PGN parsing and engine communication.
* [https://github.com/niklasf/python-chess](https://github.com/niklasf/python-chess)

### Niklas Fiekas (chessops)
Used for legal board operations, PGN parsing, and replay in the TypeScript rebuild.
* [https://github.com/niklasf/chessops](https://github.com/niklasf/chessops)

### Nathan Rugg and contributors (Stockfish.js)
The WebAssembly build lets the browser run Stockfish in its own worker.
* [https://github.com/nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js)

### Eduard Nemeth (Solista)
Special thanks for the "Solista" opening books, which were instrumental during the prototyping and testing phases of this engine runner.
* [https://solistachess.jimdosite.com/](https://solistachess.jimdosite.com/)

---
*Note: This is an independent project and is not affiliated with or endorsed by the projects listed above.*
