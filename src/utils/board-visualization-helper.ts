import { Button, OBFBoard } from "../types/coreboard-types";

export class BoardVisualizationHelper {
  /**
   * Converts RGB color to ANSI color code for terminal display
   * @param rgbColor RGB color string in format 'rgb(r, g, b)'
   * @returns ANSI color code string
   */
  static rgbToAnsi(rgbColor: string): string {
    const match = rgbColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return "\x1b[0m";

    const [_, r, g, b] = match.map(Number);
    const brightness = (r + g + b) / 3;
    const textColor = brightness < 128 ? "\x1b[97m" : "\x1b[30m";

    return `\x1b[48;2;${r};${g};${b}m${textColor}`;
  }

  /**
   * Visualizes the OBF board in the console
   * @param board OBF board object
   */
  static visualizeBoard(board: OBFBoard): void {
    const buttons = new Map(board.buttons.map((btn: Button) => [btn.id, btn]));
    const grid = board.grid;

    console.log("\nBoard Layout:");
    console.log("=".repeat(grid.columns * 15));

    for (const row of grid.order) {
      const rowVisual = row.map((buttonId) => {
        if (!buttonId) {
          return "---empty---".padEnd(12);
        }
        const button = buttons.get(buttonId);
        if (!button) {
          return "---error---".padEnd(12);
        }

        const colorCode = this.rgbToAnsi(button.background_color);
        const resetCode = "\x1b[0m";
        return `${colorCode}${button.label.padEnd(12)}${resetCode}`;
      });

      console.log(rowVisual.join("|"));
      console.log("-".repeat(grid.columns * 15));
    }
    console.log("\x1b[0m");
  }
}
