const optionsArray = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
let totalButtons = 0;

for (let i = 0; i < optionsArray.length; i++) {
  totalButtons = optionsArray[i];
  const columns = Math.ceil(Math.sqrt(totalButtons));
  const rows = Math.ceil(totalButtons / columns);
  let slots = columns * rows;
  console.log(
    `options: ${optionsArray[i]}, rows: ${rows}, columns: ${columns}, slots: ${slots}`
  );
}
