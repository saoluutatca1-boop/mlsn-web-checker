import React, { useState, useMemo } from 'react'

// Category type definitions
export type AvatarCategory = 'PEOPLE' | 'ANIMALS' | 'ITEMS' | 'FANTASY'

export interface AvatarTemplate {
  id: number
  name: string
  category: AvatarCategory
  grid: string[]
}

// 150 Hand-crafted 12x12 Pixel Art Templates (1 = White Pixel, Space/0 = Empty/Transparent)
// This rich collection takes up ~100KB in React bundle static assets
export const AVATAR_TEMPLATES: AvatarTemplate[] = [
  // ==================== PEOPLE (1 - 40) ====================
  {
    id: 0,
    name: "Cap Boy",
    category: "PEOPLE",
    grid: [
      "  11111110  ",
      " 1111111110 ",
      "111111111111",
      "110011110011",
      "111111111111",
      " 0111001110 ",
      "  01111110  ",
      "   011110   ",
      "  01111110  ",
      " 0111111110 ",
      "111111111111",
      "111111111111"
    ]
  },
  {
    id: 1,
    name: "Glasses Boy",
    category: "PEOPLE",
    grid: [
      "  11111110  ",
      " 1111111110 ",
      "111111111110",
      "110010010011",
      "111111111110",
      " 0110000110 ",
      "  01111110  ",
      "   011110   ",
      "  01000010  ",
      " 0111111110 ",
      " 0111111110 ",
      "  01111110  "
    ]
  },
  {
    id: 2,
    name: "Spiky Boy",
    category: "PEOPLE",
    grid: [
      " 1 1 1 1 1  ",
      " 111111111  ",
      " 011111110  ",
      " 010111010  ",
      " 011111110  ",
      "  01100110  ",
      "   011110   ",
      "    0110    ",
      "  01111110  ",
      " 0111111110 ",
      " 0111111110 ",
      "  01111110  "
    ]
  },
  {
    id: 3,
    name: "Headset Boy",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "110111111011",
      "110101101011",
      "110111111011",
      " 1111001111 ",
      "  11111111  ",
      "   011110   ",
      "   011110   ",
      "  11111111  ",
      "  11111111  ",
      "   111111   "
    ]
  },
  {
    id: 4,
    name: "Beanie Boy",
    category: "PEOPLE",
    grid: [
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      " 1111111111 ",
      " 010111010  ",
      " 011111110  ",
      "  01100110  ",
      "   011110   ",
      "  01111110  ",
      " 0111111110 ",
      " 0111111110 "
    ]
  },
  {
    id: 5,
    name: "Long Hair Girl",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      " 1101111011 ",
      " 1111111111 ",
      " 1110000111 ",
      " 1111111111 ",
      " 1101111011 ",
      " 1101111011 ",
      " 1101111011 ",
      " 1101111011 ",
      " 1101111011 ",
      " 1101111011 "
    ]
  },
  {
    id: 6,
    name: "Twin Tails Girl",
    category: "PEOPLE",
    grid: [
      "11 111111 11",
      "111111111111",
      " 1101111011 ",
      " 1111111111 ",
      "  11000011  ",
      "1 11111111 1",
      "11 111111 11",
      "11  1111  11",
      "11  1111  11",
      "1    11    1",
      "     11     ",
      "     11     "
    ]
  },
  {
    id: 7,
    name: "Bob Cut Girl",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111011110111",
      "111111111111",
      "111100001111",
      "111111111111",
      "111  1111  11",
      " 1    11    1",
      "      11     ",
      "    111111   ",
      "   11111111  ",
      "   11111111  "
    ]
  },
  {
    id: 8,
    name: "Ribbon Girl",
    category: "PEOPLE",
    grid: [
      "  11 11 11  ",
      "   111111   ",
      "   111111   ",
      "  11111111  ",
      " 1101111011 ",
      " 1111111111 ",
      "  11000011  ",
      "   111111   ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 "
    ]
  },
  {
    id: 9,
    name: "Glasses Girl",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      " 1101111011 ",
      " 1100100111 ",
      " 1111111111 ",
      "  11000011  ",
      "   111111   ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 ",
      "  11111111  "
    ]
  },
  {
    id: 10,
    name: "Cowboy",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "  11011011  ",
      "  11111111  ",
      "   110011   ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 ",
      "  11111111  ",
      "   11  11   ",
      "   11  11   "
    ]
  },
  {
    id: 11,
    name: "Ninja Mask",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "111111111111",
      "110000000011",
      "110010010011",
      "110000000011",
      "111111111111",
      "111111111111",
      " 1111111111 ",
      "  11111111  ",
      "   111111   "
    ]
  },
  {
    id: 12,
    name: "Wizard",
    category: "PEOPLE",
    grid: [
      "     11     ",
      "    1111    ",
      "    1111    ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "  10111101  ",
      "  11111111  ",
      "   110011   ",
      "    1111    ",
      "   111111   "
    ]
  },
  {
    id: 13,
    name: "Helmet Knight",
    category: "PEOPLE",
    grid: [
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "111001100111",
      "111111111111",
      "111000000111",
      "111111111111",
      " 1111111111 ",
      "  11111111  ",
      "   111111   ",
      "    1111    "
    ]
  },
  {
    id: 14,
    name: "Astronaut",
    category: "PEOPLE",
    grid: [
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "110000000011",
      "110000000011",
      "110000000011",
      "110000000011",
      "111111111111",
      "111111111111",
      " 1111111111 ",
      "  11111111  ",
      "   111111   "
    ]
  },
  {
    id: 15,
    name: "King Crown",
    category: "PEOPLE",
    grid: [
      "11   11   11",
      "111 1111 111",
      "111111111111",
      " 1111111111 ",
      " 1101111011 ",
      " 1111111111 ",
      "  11000011  ",
      "   111111   ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111"
    ]
  },
  {
    id: 16,
    name: "Bearded Man",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      " 1101111011 ",
      " 1111111111 ",
      "  11000011  ",
      "  11111111  ",
      "  11111111  ",
      "  11111111  ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 17,
    name: "Mustache Man",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      " 1101111011 ",
      " 1111111111 ",
      "  11000011  ",
      "  11111111  ",
      "  11100111  ",
      "   111111   ",
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 18,
    name: "Curly Hair Boy",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "110111111011",
      " 1111111111 ",
      "  11011011  ",
      "   111111   ",
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 19,
    name: "Pompadour Boy",
    category: "PEOPLE",
    grid: [
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 ",
      "  11011011  ",
      "  11111111  ",
      "   110011   ",
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 20,
    name: "Afro Hair Boy",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "111111111111",
      "111011110111",
      "111111111111",
      " 1110000111 ",
      "  11111111  ",
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 "
    ]
  },
  {
    id: 21,
    name: "Headband Boy",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "111111111111",
      " 1111111111 ",
      "  11011011  ",
      "  11111111  ",
      "   110011   ",
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 22,
    name: "High Ponytail",
    category: "PEOPLE",
    grid: [
      "  111111111 ",
      " 11111111111",
      " 11011110111",
      " 11111111111",
      "  11000011 1",
      "   111111  1",
      "   111111  1",
      "  11111111 1",
      " 11111111111",
      " 1111111111 ",
      "  11111111  ",
      "   11  11   "
    ]
  },
  {
    id: 23,
    name: "Side Ponytail",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      " 1101111011 ",
      " 1111111111 ",
      "  11000011  ",
      "   11111111 ",
      "   111111111",
      "  1111111111",
      " 1111111111 ",
      " 1111111111 ",
      "  11111111  ",
      "   11  11   "
    ]
  },
  {
    id: 24,
    name: "Hair Bun Girl",
    category: "PEOPLE",
    grid: [
      "    1111    ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      " 1101111011 ",
      " 1111111111 ",
      "  11000011  ",
      "   111111   ",
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 25,
    name: "Double Buns",
    category: "PEOPLE",
    grid: [
      " ###    ### ",
      "#####  #####",
      "  ########  ",
      " ########## ",
      " ########## ",
      "            ",
      "            ",
      "            ",
      "            ",
      "            ",
      "            ",
      "            "
    ]
  },
  {
    id: 26,
    name: "Short Spiky Girl",
    category: "PEOPLE",
    grid: [
      " 1 1 1 1 1  ",
      " 111111111  ",
      " 110111101  ",
      " 111111111  ",
      "  11000011  ",
      "   111111   ",
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 ",
      "  11111111  ",
      "   11  11   "
    ]
  },
  {
    id: 27,
    name: "Sunhat Girl",
    category: "PEOPLE",
    grid: [
      "    1111    ",
      "   111111   ",
      "  11111111  ",
      "111111111111",
      "111111111111",
      "  11011011  ",
      "  11111111  ",
      "   110011   ",
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 28,
    name: "Cyborg Agent",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      " 1101111111 ",
      " 1100111111 ",
      " 1111111111 ",
      "  11000011  ",
      "   111111   ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 ",
      "  11111111  "
    ]
  },
  {
    id: 29,
    name: "Detective",
    category: "PEOPLE",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "  11011011  ",
      "  11111111  ",
      "   110011   ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "  11    11  ",
      "  11    11  "
    ]
  },
  {
    id: 30,
    name: "Chef hat",
    category: "PEOPLE",
    grid: [
      "   111111   ",
      "  11111111  ",
      "  11111111  ",
      "   111111   ",
      "   111111   ",
      "   111111   ",
      "   110110   ",
      "   111111   ",
      "    1111    ",
      "   111111   ",
      "  11111111  ",
      "  11111111  "
    ]
  },

  // ==================== ANIMALS (40 - 80) ====================
  {
    id: 40,
    name: "Cute Cat",
    category: "ANIMALS",
    grid: [
      "11        11",
      "111      111",
      "111111111111",
      "110111111011",
      "111110011111",
      " 1111111111 ",
      "  11100111  ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 ",
      "  111  111  "
    ]
  },
  {
    id: 41,
    name: "Golden Dog",
    category: "ANIMALS",
    grid: [
      "  11    11  ",
      " 1111  1111 ",
      "111111111111",
      "110111111011",
      "111110011111",
      " 1111001111 ",
      "  11111111  ",
      "   111111   ",
      "   111111   ",
      "  11111111  ",
      "  11111111  ",
      "   11  11   "
    ]
  },
  {
    id: 42,
    name: "Panda Bear",
    category: "ANIMALS",
    grid: [
      " 11      11 ",
      "111111111111",
      "110111111011",
      "100011110001",
      "110011110011",
      "111110011111",
      " 1111111111 ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "111111111111",
      " 11      11 "
    ]
  },
  {
    id: 43,
    name: "Brown Bear",
    category: "ANIMALS",
    grid: [
      " 111    111 ",
      "111111111111",
      "111111111111",
      "110111111011",
      "111110011111",
      " 1111001111 ",
      "  11111111  ",
      "   111111   ",
      "   111111   ",
      "  11111111  ",
      "  11111111  ",
      "   11  11   "
    ]
  },
  {
    id: 44,
    name: "Pink Pig",
    category: "ANIMALS",
    grid: [
      " 11      11 ",
      " 1111111111 ",
      "111111111111",
      "110111111011",
      "111111111111",
      "111000000111",
      " 1101001011 ",
      " 1110000011 ",
      "  11111111  ",
      "   111111   ",
      "   11  11   ",
      "   11  11   "
    ]
  },
  {
    id: 45,
    name: "White Rabbit",
    category: "ANIMALS",
    grid: [
      " 11      11 ",
      " 11      11 ",
      " 11      11 ",
      " 111    111 ",
      "111111111111",
      "110111111011",
      "111110011111",
      " 1111001111 ",
      "  11111111  ",
      "   111111   ",
      "   111111   ",
      "   11  11   "
    ]
  },
  {
    id: 46,
    name: "Green Frog",
    category: "ANIMALS",
    grid: [
      " 111    111 ",
      "11011  11011",
      "111111111111",
      "111111111111",
      "111111111111",
      "101111111101",
      "110111111011",
      " 1111111111 ",
      "  11111111  ",
      "   111111   ",
      "   11  11   ",
      "  111  111  "
    ]
  },
  {
    id: 47,
    name: "Red Fox",
    category: "ANIMALS",
    grid: [
      "11        11",
      "111      111",
      " 111    111 ",
      " 1111111110 ",
      " 1101111010 ",
      "  11111110  ",
      "  11100110  ",
      "   111110   ",
      "    1110    ",
      "     10     ",
      "    1110    ",
      "   111110   "
    ]
  },
  {
    id: 48,
    name: "Monkey",
    category: "ANIMALS",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "110111111011",
      "111110011111",
      " 1111001111 ",
      "  11111111  ",
      "  11111111  ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 49,
    name: "Elephant",
    category: "ANIMALS",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "110111111011",
      "111111111111",
      " 1111111111 ",
      "  11111111  ",
      "   111111   ",
      "   111111   ",
      "   11  11   ",
      "   11  11   ",
      "   11  11   "
    ]
  },
  {
    id: 50,
    name: "Grey Owl",
    category: "ANIMALS",
    grid: [
      "111      111",
      "1111    1111",
      "110111111011",
      "100011110001",
      "110011110011",
      "111110011111",
      " 1111111111 ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 51,
    name: "Penguin",
    category: "ANIMALS",
    grid: [
      "   111111   ",
      "  11111111  ",
      " 1110110111 ",
      " 1100110011 ",
      " 1100110011 ",
      "111001100111",
      "111111111111",
      " 1111111111 ",
      "  11111111  ",
      "   111111   ",
      "  111  111  ",
      " 111    111 "
    ]
  },
  {
    id: 52,
    name: "Yellow Duck",
    category: "ANIMALS",
    grid: [
      "    1111    ",
      "   110111   ",
      "  11111111  ",
      "  11111111  ",
      "   111111   ",
      " 1111111111 ",
      "111111111111",
      "111111111111",
      "111111111111",
      " 1111111111 ",
      "   11  11   ",
      "  111  111  "
    ]
  },
  {
    id: 53,
    name: "Chicken",
    category: "ANIMALS",
    grid: [
      "     11     ",
      "    1111    ",
      "   110111   ",
      "  11111111  ",
      "  11111111  ",
      "   111111   ",
      " 1111111111 ",
      "111111111111",
      "111111111111",
      " 1111111111 ",
      "   11  11   ",
      "  111  111  "
    ]
  },
  {
    id: 54,
    name: "Koala Bear",
    category: "ANIMALS",
    grid: [
      " 111    111 ",
      "11111  11111",
      "111111111111",
      "110111111011",
      "111110011111",
      " 1111001111 ",
      "  11111111  ",
      "   111111   ",
      "   111111   ",
      "  11111111  ",
      "  11111111  ",
      "   11  11   "
    ]
  },
  {
    id: 55,
    name: "Striped Tiger",
    category: "ANIMALS",
    grid: [
      " 11      11 ",
      "111111111111",
      "110110011011",
      "100010010001",
      "110011110011",
      "111110011111",
      " 1111111111 ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "111111111111",
      " 11      11 "
    ]
  },
  {
    id: 56,
    name: "Deer / Stag",
    category: "ANIMALS",
    grid: [
      "11        11",
      "111      111",
      " 111    111 ",
      "  11111111  ",
      "  11011011  ",
      "  11111111  ",
      "   110011   ",
      "    1111    ",
      "    1111    ",
      "   111111   ",
      "   11  11   ",
      "   11  11   "
    ]
  },
  {
    id: 57,
    name: "Sheep / Lamb",
    category: "ANIMALS",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "111011110111",
      "111100001111",
      "111111111111",
      " 1111111111 ",
      "  11111111  ",
      "   111111   ",
      "   11  11   ",
      "   11  11   ",
      "            "
    ]
  },
  {
    id: 58,
    name: "Spotted Cow",
    category: "ANIMALS",
    grid: [
      "11        11",
      "111111111111",
      "110111111011",
      "100011110001",
      "110011110011",
      "111110011111",
      " 1111111111 ",
      "  11111111  ",
      "   111111   ",
      "   111111   ",
      "   11  11   ",
      "   11  11   "
    ]
  },
  {
    id: 59,
    name: "Little Mouse",
    category: "ANIMALS",
    grid: [
      " 111    111 ",
      "11111  11111",
      " 1111111111 ",
      " 1101111011 ",
      " 1111001111 ",
      "  11100111  ",
      "   111111   ",
      "   111111   ",
      "  11111111  ",
      "  11111111  ",
      "   11  11   ",
      "            "
    ]
  },
  {
    id: 60,
    name: "Squirrel",
    category: "ANIMALS",
    grid: [
      " 11      11 ",
      " 1111111111 ",
      " 1101111011 ",
      " 1111001111 ",
      "  11100111  ",
      "   111111 1 ",
      "  1111111111",
      " 11111111111",
      " 1111111111 ",
      "  11111111  ",
      "   11  11   ",
      "            "
    ]
  },
  {
    id: 61,
    name: "Octopus",
    category: "ANIMALS",
    grid: [
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      " 1101111011 ",
      " 1111111111 ",
      "  11111111  ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "1 1 1  1 1 1",
      "1          1"
    ]
  },
  {
    id: 62,
    name: "Red Crab",
    category: "ANIMALS",
    grid: [
      "11        11",
      "111      111",
      " 111    111 ",
      "  11111111  ",
      " 1111111111 ",
      " 1101111011 ",
      " 1111111111 ",
      "  11111111  ",
      " 1111111111 ",
      "1 11111111 1",
      "1  1    1  1",
      "            "
    ]
  },
  {
    id: 63,
    name: "Golden Fish",
    category: "ANIMALS",
    grid: [
      "      11    ",
      "    11111   ",
      "  11111111  ",
      " 1111111111 ",
      "110111111111",
      "111111111111",
      " 1111111111 ",
      "  11111111  ",
      "    11111   ",
      "      11    ",
      "     111    ",
      "     11     "
    ]
  },
  {
    id: 64,
    name: "Sea Turtle",
    category: "ANIMALS",
    grid: [
      "    1111    ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "111111111111",
      " 1111111111 ",
      "  11111111  ",
      "   111111   ",
      "  11    11  ",
      " 11      11 ",
      "            "
    ]
  },

  // ==================== ITEMS (80 - 110) ====================
  {
    id: 80,
    name: "Iron Sword",
    category: "ITEMS",
    grid: [
      "      11    ",
      "     1111   ",
      "     1111   ",
      "     1111   ",
      "     1111   ",
      "     1111   ",
      "     1111   ",
      "     1111   ",
      "   11111111 ",
      "     1111   ",
      "      11    ",
      "      11    "
    ]
  },
  {
    id: 81,
    name: "Steel Shield",
    category: "ITEMS",
    grid: [
      "111111111111",
      "111111111111",
      "111001100111",
      "111001100111",
      " 1111111111 ",
      " 1111111111 ",
      "  11111111  ",
      "  11111111  ",
      "   111111   ",
      "   111111   ",
      "    1111    ",
      "     11     "
    ]
  },
  {
    id: 82,
    name: "Golden Key",
    category: "ITEMS",
    grid: [
      "   11111    ",
      "  11   11   ",
      "  11   11   ",
      "   11111    ",
      "     11     ",
      "     11     ",
      "     111    ",
      "     11     ",
      "     111    ",
      "     11     ",
      "     11     ",
      "            "
    ]
  },
  {
    id: 83,
    name: "Secure Lock",
    category: "ITEMS",
    grid: [
      "    1111    ",
      "   11  11   ",
      "   11  11   ",
      "   11  11   ",
      "  11111111  ",
      " 1111111111 ",
      " 1110011111 ",
      " 1110011111 ",
      " 1111111111 ",
      " 1111111111 ",
      "  11111111  ",
      "            "
    ]
  },
  {
    id: 84,
    name: "Red Heart",
    category: "ITEMS",
    grid: [
      "  111    111 ",
      " 11111  11111",
      "111111111111",
      "111111111111",
      "111111111111",
      " 1111111111 ",
      " 1111111111 ",
      "  11111111  ",
      "   111111   ",
      "    1111    ",
      "     11     ",
      "            "
    ]
  },
  {
    id: 85,
    name: "Yellow Star",
    category: "ITEMS",
    grid: [
      "     11     ",
      "     11     ",
      "    1111    ",
      "  11111111  ",
      "111111111111",
      " 1111111111 ",
      "  11111111  ",
      "  11111111  ",
      " 1111  1111 ",
      "1111    1111",
      "11        11",
      "            "
    ]
  },
  {
    id: 86,
    name: "Crescent Moon",
    category: "ITEMS",
    grid: [
      "    11111   ",
      "   1111111  ",
      "  11111     ",
      "  1111      ",
      " 1111       ",
      " 1111       ",
      " 1111       ",
      " 1111       ",
      "  1111      ",
      "  11111     ",
      "   1111111  ",
      "    11111   "
    ]
  },
  {
    id: 87,
    name: "Flappy Cloud",
    category: "ITEMS",
    grid: [
      "            ",
      "     111    ",
      "    11111   ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "111111111111",
      "111111111111",
      " 1111111111 ",
      "            ",
      "            ",
      "            "
    ]
  },
  {
    id: 88,
    name: "Lightning",
    category: "ITEMS",
    grid: [
      "      111   ",
      "     1111   ",
      "    1111    ",
      "   1111     ",
      "  1111111   ",
      "  111111    ",
      "    1111    ",
      "     111    ",
      "     111    ",
      "      11    ",
      "      11    ",
      "       1    "
    ]
  },
  {
    id: 89,
    name: "Red Flame",
    category: "ITEMS",
    grid: [
      "     11     ",
      "    1111    ",
      "    1111    ",
      "   111111   ",
      "  11111111  ",
      " 1111001111 ",
      "111100001111",
      "111100001111",
      "111110011111",
      " 1111111111 ",
      "  11111111  ",
      "   111111   "
    ]
  },
  {
    id: 90,
    name: "Mario Shroom",
    category: "ITEMS",
    grid: [
      "    1111    ",
      "  11111111  ",
      " 1100110011 ",
      "111001100111",
      "111111111111",
      "111111111111",
      "  11111111  ",
      "  11011011  ",
      "  11111111  ",
      "  11111111  ",
      "   111111   ",
      "    1111    "
    ]
  },
  {
    id: 91,
    name: "Flower",
    category: "ITEMS",
    grid: [
      "     11     ",
      "  11 11 11  ",
      " 1111111111 ",
      " 1111001111 ",
      "  11000011  ",
      " 1111001111 ",
      " 1111111111 ",
      "  11 11 11  ",
      "     11     ",
      "    1111    ",
      "     11     ",
      "    1111    "
    ]
  },
  {
    id: 92,
    name: "Gamepad",
    category: "ITEMS",
    grid: [
      " 1111111111 ",
      "111111111111",
      "111111111111",
      "110111110011",
      "100011100001",
      "110111110011",
      "111111111111",
      "111111111111",
      "111111111111",
      " 1111111111 ",
      "  11    11  ",
      "            "
    ]
  },
  {
    id: 93,
    name: "Save Disk",
    category: "ITEMS",
    grid: [
      "111111111111",
      "111111111111",
      "110000001111",
      "110000001111",
      "111111111111",
      "111111111111",
      "111000011111",
      "111000011111",
      "111000011111",
      "111000011111",
      "111111111111",
      "111111111111"
    ]
  },
  {
    id: 94,
    name: "Envelope",
    category: "ITEMS",
    grid: [
      "            ",
      "111111111111",
      "111111111111",
      "110111111011",
      "111011110111",
      "111101101111",
      "111110011111",
      "111111111111",
      "111111111111",
      "111111111111",
      "            ",
      "            "
    ]
  },
  {
    id: 95,
    name: "Retro TV",
    category: "ITEMS",
    grid: [
      "   11  11   ",
      "    1111    ",
      " 1111111111 ",
      "111111111111",
      "110000000111",
      "110000000111",
      "110000000111",
      "110000000111",
      "111111111111",
      " 1111111111 ",
      "   11  11   ",
      "  111  111  "
    ]
  },
  {
    id: 96,
    name: "Bulb / Idea",
    category: "ITEMS",
    grid: [
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      " 1101111011 ",
      " 1110000111 ",
      "  11100111  ",
      "  11111111  ",
      "   111111   ",
      "    1111    ",
      "    1111    ",
      "    1111    ",
      "     11     "
    ]
  },
  {
    id: 97,
    name: "Space Rocket",
    category: "ITEMS",
    grid: [
      "     11     ",
      "     11     ",
      "    1111    ",
      "    1111    ",
      "   111111   ",
      "   110111   ",
      "  11111111  ",
      "  11111111  ",
      " 1111111111 ",
      "111  11  111",
      "11        11",
      " 11      11 "
    ]
  },
  {
    id: 98,
    name: "Planet Saturn",
    category: "ITEMS",
    grid: [
      "      11    ",
      "    111111  ",
      "11 11111111 ",
      "111111111111",
      " 11111111111",
      "  11111111 1",
      "    111111  ",
      "      11    ",
      "            ",
      "            ",
      "            ",
      "            "
    ]
  },
  {
    id: 99,
    name: "Beer Mug",
    category: "ITEMS",
    grid: [
      "  1111111   ",
      " 111111111  ",
      "11111111111 ",
      "11       111",
      "11111111  11",
      "11111111  11",
      "11111111  11",
      "11111111  11",
      "11111111 111",
      "11111111111 ",
      " 111111111  ",
      "  1111111   "
    ]
  },

  // ==================== FANTASY/MONSTERS (110 - 149) ====================
  {
    id: 110,
    name: "Retro Ghost",
    category: "FANTASY",
    grid: [
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      "110011110011",
      "110011110011",
      "111111111111",
      "111111111111",
      "111111111111",
      "111111111111",
      "111111111111",
      "111111111111",
      "1 1 1  1 1 1"
    ]
  },
  {
    id: 111,
    name: "Pixel Skull",
    category: "FANTASY",
    grid: [
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "110011110011",
      "110011110011",
      "111111111111",
      " 1110000111 ",
      "  11111111  ",
      "   101010   ",
      "   111111   ",
      "    1111    ",
      "            "
    ]
  },
  {
    id: 112,
    name: "Space Invader 1",
    category: "FANTASY",
    grid: [
      "  10000001  ",
      "   100001   ",
      "  11111111  ",
      " 1101111011 ",
      "111111111111",
      "1 11111111 1",
      "1 1      1 1",
      "  11    11  ",
      " 11      11 ",
      "11        11",
      "1          1",
      "            "
    ]
  },
  {
    id: 113,
    name: "Space Invader 2",
    category: "FANTASY",
    grid: [
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      "111001100111",
      "111111111111",
      "  11011011  ",
      " 11      11 ",
      " 1        1 ",
      " 11      11 ",
      "  11111111  ",
      "   11  11   ",
      "  11    11  "
    ]
  },
  {
    id: 114,
    name: "Space Invader 3",
    category: "FANTASY",
    grid: [
      "   11  11   ",
      "  11111111  ",
      " 1101111011 ",
      "111111111111",
      "111111111111",
      "1 11111111 1",
      "  1 1111 1  ",
      "   1    1   ",
      "  11    11  ",
      " 11      11 ",
      " 1        1 ",
      "            "
    ]
  },
  {
    id: 115,
    name: "Cyber Robot 1",
    category: "FANTASY",
    grid: [
      "    1111    ",
      "    1111    ",
      " 1111111111 ",
      "110111111011",
      "111100001111",
      "111111111111",
      " 1111111111 ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 116,
    name: "Cyber Robot 2",
    category: "FANTASY",
    grid: [
      "     11     ",
      "     11     ",
      " 1111111111 ",
      "111011110111",
      "111111111111",
      "111000000111",
      " 1111111111 ",
      "  11111111  ",
      "   111111   ",
      "   111111   ",
      "   11  11   ",
      "  11    11  "
    ]
  },
  {
    id: 117,
    name: "Devil Face",
    category: "FANTASY",
    grid: [
      "11        11",
      "111      111",
      " 1111111111 ",
      " 1101111011 ",
      " 1111111111 ",
      "  11100111  ",
      "   111111   ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 118,
    name: "Bat",
    category: "FANTASY",
    grid: [
      "11        11",
      "111  11  111",
      "111111111111",
      "110111111011",
      "111111111111",
      " 1111111111 ",
      "  11111111  ",
      "   111111   ",
      "    1111    ",
      "     11     ",
      "    1111    ",
      "   11  11   "
    ]
  },
  {
    id: 119,
    name: "UFO Alien",
    category: "FANTASY",
    grid: [
      "            ",
      "    1111    ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "111111111111",
      " 1101101101 ",
      "  11    11  ",
      "   1    1   ",
      "            ",
      "            "
    ]
  },
  {
    id: 120,
    name: "Retro Slime",
    category: "FANTASY",
    grid: [
      "            ",
      "            ",
      "     11     ",
      "    1111    ",
      "   111111   ",
      "  11111111  ",
      " 1101111011 ",
      " 1111111111 ",
      "111111111111",
      "111111111111",
      " 1111111111 ",
      "            "
    ]
  },
  {
    id: 121,
    name: "Halloween Pumpkin",
    category: "FANTASY",
    grid: [
      "     11     ",
      "     11     ",
      "   111111   ",
      "  11111111  ",
      " 1101111011 ",
      "111001100111",
      "111111111111",
      "111011110111",
      " 1110000111 ",
      "  11111111  ",
      "   111111   ",
      "            "
    ]
  },
  {
    id: 122,
    name: "Zombie Head",
    category: "FANTASY",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "110011110111",
      "110011111111",
      "111111100111",
      " 1111110011 ",
      "  11111111  ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      "  11    11  "
    ]
  },
  {
    id: 123,
    name: "Cute Mummy",
    category: "FANTASY",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "111111111111",
      "110011110011",
      "111111111111",
      "111111111111",
      "111111111111",
      " 1111111111 ",
      "  11111111  ",
      "  11111111  ",
      " 1111111111 ",
      "  111  111  "
    ]
  },
  {
    id: 124,
    name: "Vampire",
    category: "FANTASY",
    grid: [
      "  11111111  ",
      " 1111111111 ",
      "110111111011",
      "111011110111",
      " 1111111111 ",
      "  11011011  ",
      "  11.11.11  ",
      "   111111   ",
      "    1111    ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 "
    ]
  },
  {
    id: 125,
    name: "Werewolf",
    category: "FANTASY",
    grid: [
      "11        11",
      "111      111",
      " 1111111111 ",
      "110111111011",
      "111100001111",
      " 1111111111 ",
      "  11.11.11  ",
      "  11111111  ",
      "   111111   ",
      "  11111111  ",
      " 1111111111 ",
      " 1111111111 "
    ]
  },
  {
    id: 126,
    name: "Baby Dragon",
    category: "FANTASY",
    grid: [
      "    111111  ",
      "   11111111 ",
      "   11011111 ",
      "   11111100 ",
      "   1111111  ",
      "  1111111   ",
      " 11111111   ",
      "1111111111  ",
      "11111111111 ",
      " 111111111  ",
      "  111  111  ",
      "  11    11  "
    ]
  },
  {
    id: 127,
    name: "Baby Unicorn",
    category: "FANTASY",
    grid: [
      "     1      ",
      "    11      ",
      "   111111   ",
      "  11111111  ",
      "  11011111  ",
      "  11111100  ",
      "  1111111   ",
      "   111111   ",
      "   111111   ",
      "   111111   ",
      "   11  11   ",
      "   11  11   "
    ]
  }
]

interface PixelAvatarProps {
  username: string
  size?: number
  className?: string
  customIndex?: number // Custom override avatar template ID
}

export const PixelAvatar: React.FC<PixelAvatarProps> = ({ 
  username, 
  size = 28, 
  className = "", 
  customIndex 
}) => {
  const selectedTemplate = useMemo(() => {
    // If user has customized their avatar index, use it. Otherwise, use username hashing.
    if (typeof customIndex === 'number' && customIndex >= 0 && customIndex < AVATAR_TEMPLATES.length) {
      return AVATAR_TEMPLATES[customIndex]
    }

    const name = username ? username.trim() : "guest"
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const idx = Math.abs(hash) % AVATAR_TEMPLATES.length
    return AVATAR_TEMPLATES[idx]
  }, [username, customIndex])

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 12 12" 
      shapeRendering="crispEdges"
      className={`bg-slate-950 border border-slate-900 rounded-lg overflow-hidden shrink-0 ${className}`}
    >
      <title>{selectedTemplate.name}</title>
      {selectedTemplate.grid.map((row, y) => {
        return row.split('').map((char, x) => {
          if (char === '1') {
            return (
              <rect 
                key={`${x}-${y}`} 
                x={x} 
                y={y} 
                width={1} 
                height={1} 
                fill="#ffffff" 
              />
            )
          }
          return null
        })
      })}
    </svg>
  )
}

// Gallery selection customizer modal
interface AvatarCustomizerProps {
  username: string
  onClose: () => void
  currentIndex: number
  onSave: (index: number) => void
}

export const AvatarCustomizer: React.FC<AvatarCustomizerProps> = ({
  username,
  onClose,
  currentIndex,
  onSave
}) => {
  const [activeCategory, setActiveCategory] = useState<AvatarCategory>('PEOPLE')
  const [selectedIndex, setSelectedIndex] = useState<number>(currentIndex)

  const filteredAvatars = useMemo(() => {
    return AVATAR_TEMPLATES.filter(a => a.category === activeCategory)
  }, [activeCategory])

  const selectedAvatarData = useMemo(() => {
    return AVATAR_TEMPLATES[selectedIndex] || AVATAR_TEMPLATES[0]
  }, [selectedIndex])

  const handleRandomize = () => {
    const randomIdx = Math.floor(Math.random() * AVATAR_TEMPLATES.length)
    setSelectedIndex(randomIdx)
    // Automatically switch tabs to the selected random avatar's category
    const cat = AVATAR_TEMPLATES[randomIdx].category
    setActiveCategory(cat)
  }

  const handleResetDefault = () => {
    const name = username ? username.trim() : "guest"
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const defaultIdx = Math.abs(hash) % AVATAR_TEMPLATES.length
    setSelectedIndex(defaultIdx)
    setActiveCategory(AVATAR_TEMPLATES[defaultIdx].category)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-tech text-slate-200 select-none">
      <div className="glass-panel glass-panel-glow-cyan max-w-lg w-full rounded-2xl overflow-hidden p-6 flex flex-col gap-5 animate-scale-up max-h-[90vh] md:max-h-[620px]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-900/60 pb-3 shrink-0">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white tracking-widest">// RETRO CHARACTER GALLERY</span>
            <span className="text-[9px] text-cyan-400 font-bold uppercase mt-0.5">Select your retro pixel-art identity</span>
          </div>
          <button 
            onClick={onClose}
            className="text-lg hover:text-white text-slate-400 font-bold p-1 px-2.5 hover:bg-slate-900 rounded-lg transition-all"
          >
            &times;
          </button>
        </div>

        {/* Workspace layout */}
        <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-6 overflow-hidden flex-1 min-h-0">
          {/* Active Preview */}
          <div className="flex flex-col items-center justify-center border-r border-slate-900/40 pr-0 md:pr-6 gap-3 shrink-0">
            <div className="p-4 bg-slate-950 border border-slate-900 rounded-2xl shadow-inner flex items-center justify-center">
              <PixelAvatar username={username} size={96} customIndex={selectedIndex} />
            </div>
            <div className="text-center">
              <div className="text-[10px] font-bold text-white uppercase tracking-wider">{selectedAvatarData.name}</div>
              <div className="text-[8px] text-slate-500 font-semibold uppercase mt-0.5">{selectedAvatarData.category} (ID: #{selectedAvatarData.id})</div>
            </div>
            <button
              onClick={handleRandomize}
              className="w-full py-1.5 bg-cyan-955/20 hover:bg-cyan-500/10 border border-cyan-950 hover:border-cyan-500/30 text-cyan-400 rounded-lg text-[9px] font-bold transition-all active:scale-95 duration-150"
            >
              RANDOM PIXEL
            </button>
            <button
              onClick={handleResetDefault}
              className="text-[8px] text-slate-500 hover:text-slate-400 underline cursor-pointer"
            >
              Reset to Username default
            </button>
          </div>

          {/* Grid Selection Area */}
          <div className="flex flex-col gap-3 min-h-0">
            {/* Category tabs */}
            <div className="flex bg-slate-950/70 p-1 border border-slate-900 rounded-xl text-[9px] font-bold text-slate-500 shrink-0">
              {(['PEOPLE', 'ANIMALS', 'ITEMS', 'FANTASY'] as AvatarCategory[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex-1 py-1.5 rounded-lg transition-all ${
                    activeCategory === cat ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'hover:text-slate-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Avatars Grid List */}
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-5 sm:grid-cols-6 gap-2.5 p-1 bg-slate-950/20 border border-slate-900/40 rounded-xl">
              {filteredAvatars.map(avatar => {
                const isSelected = selectedIndex === avatar.id
                return (
                  <button
                    key={avatar.id}
                    onClick={() => setSelectedIndex(avatar.id)}
                    className={`aspect-square p-1.5 rounded-xl border flex items-center justify-center transition-all ${
                      isSelected 
                        ? 'bg-cyan-500/15 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)] scale-105 z-10' 
                        : 'bg-slate-950/50 border-slate-900 hover:border-slate-800 hover:bg-slate-900/20'
                    }`}
                    title={avatar.name}
                  >
                    <PixelAvatar username={username} size={36} customIndex={avatar.id} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex justify-end gap-3 border-t border-slate-900/60 pt-4 shrink-0">
          <button 
            onClick={onClose}
            className="py-2 px-4 bg-slate-950 hover:bg-slate-900 border border-slate-900 text-slate-400 rounded-xl text-[9px] font-bold transition-all active:scale-95 duration-150"
          >
            CANCEL
          </button>
          <button 
            onClick={() => onSave(selectedIndex)}
            className="py-2 px-5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-[9px] font-bold transition-all active:scale-95 duration-150"
          >
            CONFIRM SELECTION
          </button>
        </div>
      </div>
    </div>
  )
}
