export function detectLanguage(text:string):string {
  const persianRegex = /[\u0600-\u06FF]/;
  const englishRegex = /[A-Za-z]/;

  const isPersian = persianRegex.test(text);
  const isEnglish = englishRegex.test(text);

  if (isPersian) {
    return "fa";
  }else {
    return "en";
  }

}
