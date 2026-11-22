// The creature cards of the select screen (22_chars.gml): what the animal is, its ability, its controls.
// Controls are keycaps on a computer and the on-screen controls on a touch device.
export const CHAR_TEXT = {
  ru: [
    {
      desc: 'Кальмар — головоногий моллюск и один из самых быстрых обитателей моря: он плавает реактивно, выталкивая воду через воронку, и разгоняется до 40 км/ч, а летающие кальмары выпрыгивают из воды и пролетают десятки метров. У него три сердца и голубая кровь, а у гигантского кальмара самые большие глаза в животном мире — размером с футбольный мяч. Кальмары — главная пища кашалотов, тюленей и многих рыб.',
      abil: 'Без особых умений: скорость и резкие повороты',
      keys: [['W|S', 'плыть вперёд / назад'], ['A|D', 'поворот'], ['^|v', 'всплыть / нырнуть'], ['Shift', 'рывок'], ['Esc', 'пауза']],
      touch: [['Стик', 'поворот, всплыть / нырнуть'], ['Плыть', 'вперёд'], ['Рывок', 'ускорение, тратит силы']],
    },
    {
      desc: 'Наутилус — живое ископаемое: его предки плавали в морях ещё 500 миллионов лет назад, задолго до динозавров. Раковина разделена перегородками на камеры с газом, и, меняя их наполнение, наутилус всплывает и погружается, как подводная лодка — кстати, в честь него названа лодка капитана Немо. Днём он держится на глубине до 700 м, ночью поднимается к рифам. Из-за торговли красивыми раковинами наутилусы стали редкими.',
      abil: 'Раковина-укрытие: внутри укусы не страшны',
      keys: [['W|S', 'плыть вперёд / назад'], ['A|D', 'поворот'], ['^|v', 'всплыть / нырнуть'], ['Shift', 'толчок — каждое нажатие'], ['F', 'спрятаться в раковину'], ['Esc', 'пауза']],
      touch: [['Стик', 'поворот, всплыть / нырнуть'], ['Плыть', 'вперёд'], ['Рывок', 'толчок — каждое нажатие'], ['Раковина', 'спрятаться']],
    },
    {
      desc: 'Осьминог — один из самых умных обитателей моря: он решает головоломки, откручивает крышки банок и узнаёт людей в лицо. Две трети его нейронов находятся в щупальцах, и каждое из них может действовать почти само по себе. Кожа осьминога за доли секунды меняет цвет и рисунок, повторяя песок, камни и водоросли. Синекольчатый осьминог размером с ладонь несёт яд, смертельно опасный для человека.',
      abil: 'Засадный охотник: маскировка на дне и чернильное облако',
      keys: [['W|S', 'ползти вперёд / назад'], ['A|D', 'поворот'], ['^|v', 'взгляд вверх / вниз'], ['Shift', 'прыжок туда, куда смотрите'], ['F', 'чернильное облако'], ['Esc', 'пауза']],
      touch: [['Стик', 'поворот, взгляд вверх / вниз'], ['Плыть', 'ползти'], ['Рывок', 'прыжок туда, куда смотрите'], ['Чернила', 'чернильное облако']],
    },
  ],
  en: [
    {
      desc: 'The squid is a cephalopod and one of the fastest animals in the sea: it swims by jet propulsion, pushing water out through its funnel, and reaches 40 km/h — flying squids even leap out of the water and glide for dozens of metres. It has three hearts and blue blood, and the giant squid has the largest eyes in the animal kingdom, the size of a football. Squids are the main food of sperm whales, seals and many fish.',
      abil: 'No special skill: speed and sharp turns',
      keys: [['W|S', 'swim forward / back'], ['A|D', 'turn'], ['^|v', 'rise / dive'], ['Shift', 'dash'], ['Esc', 'pause']],
      touch: [['Stick', 'turn, rise / dive'], ['Swim', 'forward'], ['Dash', 'speed up, uses stamina']],
    },
    {
      desc: 'The nautilus is a living fossil: its ancestors swam the seas 500 million years ago, long before the dinosaurs. Its shell is divided into gas-filled chambers, and by changing what is inside them the nautilus rises and sinks like a submarine — Captain Nemo\'s submarine was named after it. By day it keeps to depths of up to 700 m, at night it rises to the reefs. The trade in its beautiful shells has made the nautilus rare.',
      abil: 'Shell shelter: bites do no harm inside',
      keys: [['W|S', 'swim forward / back'], ['A|D', 'turn'], ['^|v', 'rise / dive'], ['Shift', 'push — one per press'], ['F', 'hide in the shell'], ['Esc', 'pause']],
      touch: [['Stick', 'turn, rise / dive'], ['Swim', 'forward'], ['Dash', 'push — one per press'], ['Shell', 'hide']],
    },
    {
      desc: 'The octopus is one of the cleverest animals in the sea: it solves puzzles, unscrews jar lids and recognises human faces. Two thirds of its neurons are in its arms, and each arm can act almost on its own. In a fraction of a second its skin changes colour and pattern to match sand, rocks and seaweed. The blue-ringed octopus, no bigger than a palm, carries a venom deadly to humans.',
      abil: 'Ambush hunter: camouflage on the bottom and an ink cloud',
      keys: [['W|S', 'crawl forward / back'], ['A|D', 'turn'], ['^|v', 'look up / down'], ['Shift', 'leap where you look'], ['F', 'ink cloud'], ['Esc', 'pause']],
      touch: [['Stick', 'turn, look up / down'], ['Swim', 'crawl'], ['Dash', 'leap where you look'], ['Ink', 'ink cloud']],
    },
  ],
};
