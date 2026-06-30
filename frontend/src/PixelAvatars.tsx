import React, { useState, useMemo } from 'react'

// Layers composition characters:
// '#' = Draw White Pixel
// '.' = Erase/Draw Black Pixel (to create cutouts for eyes/mouth on the face)
// ' ' = Transparent (do not change underlying pixel)

export const FACES = [
  // 1. Normal Face
  [
    "            ",
    "  ########  ",
    " ########## ",
    "############",
    "############",
    "############",
    "############",
    "############",
    " ########## ",
    "  ########  ",
    "   ######   ",
    "            "
  ],
  // 2. Slim Face
  [
    "            ",
    "   ######   ",
    "  ########  ",
    "  ########  ",
    "  ########  ",
    "  ########  ",
    "  ########  ",
    "  ########  ",
    "   ######   ",
    "    ####    ",
    "    ####    ",
    "            "
  ],
  // 3. Chubby Face
  [
    "            ",
    "  ########  ",
    " ########## ",
    "############",
    "############",
    "############",
    "############",
    "############",
    "############",
    " ########## ",
    "  ########  ",
    "   ######   "
  ],
  // 4. Robot Face
  [
    "            ",
    " ########## ",
    " ########## ",
    " ########## ",
    " ########## ",
    " ########## ",
    " ########## ",
    " ########## ",
    " ########## ",
    " ########## ",
    "  ########  ",
    "            "
  ],
  // 5. Alien Face
  [
    "  ########  ",
    " ########## ",
    "############",
    "############",
    "############",
    " ########## ",
    "  ########  ",
    "   ######   ",
    "    ####    ",
    "    ####    ",
    "     ##     ",
    "            "
  ],
  // 6. Skull Face
  [
    "  ########  ",
    " ########## ",
    "############",
    "############",
    " ###..###   ",
    " ########## ",
    "  ###..###  ",
    "   ######   ",
    "   #.##.#   ",
    "   ######   ",
    "    ####    ",
    "            "
  ],
  // 7. Cat Face
  [
    "#          #",
    "##        ##",
    "###      ###",
    "############",
    "############",
    "############",
    "############",
    "############",
    " ########## ",
    "  ########  ",
    "   ######   ",
    "            "
  ],
  // 8. Pig Face
  [
    " #        # ",
    " ##      ## ",
    " ########## ",
    "############",
    "############",
    "############",
    "############",
    "############",
    " ########## ",
    "  ########  ",
    "   ######   ",
    "            "
  ],
  // 9. Frog Face
  [
    " ##      ## ",
    "####    ####",
    "############",
    "############",
    "############",
    "############",
    "############",
    "############",
    " ########## ",
    "  ########  ",
    "            ",
    "            "
  ],
  // 10. Fox Face
  [
    "#          #",
    "##        ##",
    " ########## ",
    " ########## ",
    "  ########  ",
    "  ########  ",
    "   ######   ",
    "   ######   ",
    "    ####    ",
    "    ####    ",
    "     ##     ",
    "            "
  ],
  // 11. Koala Face
  [
    " ###    ### ",
    "#####  #####",
    "############",
    "############",
    "############",
    "############",
    "############",
    " ########## ",
    "  ########  ",
    "   ######   ",
    "            ",
    "            "
  ],
  // 12. Panda Face
  [
    " ##      ## ",
    "####    ####",
    "############",
    "############",
    "############",
    "############",
    "############",
    "############",
    " ########## ",
    "  ########  ",
    "   ######   ",
    "            "
  ]
]

export const EYES = [
  // 1. Normal Eyes
  [
    "            ",
    "            ",
    "            ",
    "  .      .  ",
    "  .      .  ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 2. Glasses
  [
    "            ",
    "            ",
    "            ",
    " ###    ### ",
    "# . #  # . #",
    " ###    ### ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 3. Sunglasses
  [
    "            ",
    "            ",
    "            ",
    " #########  ",
    "  ..   ..   ",
    "  ..   ..   ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 4. Goggles
  [
    "            ",
    "            ",
    " ########## ",
    "##..####..##",
    "##..####..##",
    " ########## ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 5. Wink
  [
    "            ",
    "            ",
    "            ",
    "  .    ###  ",
    "  .         ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 6. Angry Eyes
  [
    "            ",
    "            ",
    "  ..    ..  ",
    "   .    .   ",
    "   .    .   ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 7. Cute/Big Eyes
  [
    "            ",
    "            ",
    "  ##    ##  ",
    "  .#    .#  ",
    "  ##    ##  ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 8. Sleeping/Closed
  [
    "            ",
    "            ",
    "            ",
    "  ###  ###  ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 9. Cyborg Laser Eye
  [
    "            ",
    "            ",
    "        ##  ",
    "  .    #### ",
    "       #### ",
    "        ##  ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 10. Ninja Mask Eyes (cutout)
  [
    "            ",
    "            ",
    "            ",
    "  .      .  ",
    "  .      .  ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 11. Glowing white eyes
  [
    "            ",
    "            ",
    "            ",
    "  #      #  ",
    "  #      #  ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 12. Hollow Eyes
  [
    "            ",
    "            ",
    "   ##    ## ",
    "  #..#  #..#",
    "  #..#  #..#",
    "   ##    ## ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ]
]

export const MOUTHS = [
  // 1. Smile
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "  .    .    ",
    "   .  .     ",
    "    ..      ",
    "            ",
    "            "
  ],
  // 2. Frown
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "    ..      ",
    "   .  .     ",
    "  .    .    ",
    "            ",
    "            "
  ],
  // 3. Open Mouth
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "   ####     ",
    "   #..#     ",
    "   ####     ",
    "            ",
    "            "
  ],
  // 4. Teeth Grill
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "  ######    ",
    "  #.#.##    ",
    "  ######    ",
    "            ",
    "            "
  ],
  // 5. Mustache
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "  ######    ",
    " ##.##.##   ",
    "  #    #    ",
    "            ",
    "            "
  ],
  // 6. Beard
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "   ####     ",
    "  ######    ",
    "  ######    ",
    "   ####     "
  ],
  // 7. Goatee
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "    ..      ",
    "    ..      ",
    "    ##      ",
    "    ##      ",
    "            "
  ],
  // 8. Ninja Mask (Covers mouth)
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    " ########## ",
    "############",
    "############",
    " ########## ",
    "  ########  ",
    "            "
  ],
  // 9. Tongue Out
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "    ..      ",
    "   .##.     ",
    "    ##      ",
    "            ",
    "            "
  ],
  // 10. Pacifier / Nose (For animals)
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "   ####     ",
    "   ####     ",
    "    ##      ",
    "            ",
    "            "
  ],
  // 11. Buck Teeth
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "   ####     ",
    "   #.#.     ",
    "            ",
    "            ",
    "            "
  ],
  // 12. Neutral Line
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "   ####     ",
    "            ",
    "            ",
    "            ",
    "            "
  ]
]

export const HAIRS = [
  // 1. Bald
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 2. Cap
  [
    "  ########  ",
    " ########## ",
    "############",
    "############",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 3. Spiky Hair
  [
    " # # # # #  ",
    " #########  ",
    " #########  ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 4. Long Hair
  [
    "  ########  ",
    " ########## ",
    "##########  ",
    "##  ##  ##  ",
    "##      ##  ",
    "##      ##  ",
    "##      ##  ",
    "##      ##  ",
    "##      ##  ",
    "##      ##  ",
    "##      ##  ",
    "            "
  ],
  // 5. Bob Cut
  [
    "  ########  ",
    " ########## ",
    "############",
    "####    ####",
    "###      ###",
    "###      ###",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 6. Twin Tails
  [
    "## ###### ##",
    "############",
    "##        ##",
    "##        ##",
    "##        ##",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 7. Beanie
  [
    "   ######   ",
    "  ########  ",
    " ########## ",
    " ########## ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 8. Afro
  [
    "  ########  ",
    " ########## ",
    "############",
    "############",
    "############",
    " ########## ",
    "  ########  ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 9. Pompadour
  [
    "   ######   ",
    "  ########  ",
    " ########## ",
    " ########## ",
    "  ########  ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 10. Headband
  [
    "            ",
    "  ########  ",
    " ########## ",
    " ########## ",
    "  ########  ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 11. Bun
  [
    "    ####    ",
    "   ######   ",
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
  ],
  // 12. Double Buns
  [
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
  ],
  // 13. Crown (King)
  [
    "##   ##   ##",
    "### #### ###",
    "############",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 14. Wizard Hat
  [
    "     ##     ",
    "    ####    ",
    "    ####    ",
    "   ######   ",
    "  ########  ",
    " ########## ",
    "############",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 15. Knight Helmet
  [
    "   ######   ",
    "  ########  ",
    " ########## ",
    "############",
    "###      ###",
    "############",
    "###      ###",
    "############",
    " ########## ",
    "            ",
    "            ",
    "            "
  ],
  // 16. Devil Horns
  [
    "##        ##",
    "##        ##",
    " #        # ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ]
]

export const ACCESSORIES = [
  // 1. None
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 2. Headphones
  [
    "  ########  ",
    " ########## ",
    "##        ##",
    "##        ##",
    "##        ##",
    " #        # ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 3. Cyber Scanner (Eye Patch variant)
  [
    "            ",
    "            ",
    " #######    ",
    " #  .  #    ",
    " #######    ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 4. Earrings
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    " #        # ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 5. Blushing cheeks
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "  #      #  ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 6. Bandage on cheek
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "       #    ",
    "      ###   ",
    "       #    ",
    "            ",
    "            ",
    "            "
  ],
  // 7. Bowtie / Collar
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "    ####    ",
    "   ##.##    ",
    "    ####    "
  ],
  // 8. Halo
  [
    "   ######   ",
    "  #      #  ",
    "   ######   ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 9. Necktie
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "     ##     ",
    "    ####    ",
    "     ##     "
  ],
  // 10. Scarf
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    " ########## ",
    " ########## ",
    "  ####      "
  ],
  // 11. Monocle
  [
    "            ",
    "            ",
    "  ##        ",
    " #  #       ",
    "  ##        ",
    "   #        ",
    "   ######   ",
    "        #   ",
    "            ",
    "            ",
    "            ",
    "            "
  ],
  // 12. Cigarette / Cigar (Pacman style)
  [
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "            ",
    "       ###  ",
    "            ",
    "            ",
    "            "
  ]
]

// Compose avatar matrix from selections
export function getPixelAvatarMatrix(
  faceIdx: number,
  eyesIdx: number,
  mouthIdx: number,
  hairIdx: number,
  accIdx: number
): boolean[][] {
  const canvas = Array(12).fill(null).map(() => Array(12).fill(false))

  const face = FACES[faceIdx % FACES.length]
  const eyes = EYES[eyesIdx % EYES.length]
  const mouth = MOUTHS[mouthIdx % MOUTHS.length]
  const hair = HAIRS[hairIdx % HAIRS.length]
  const acc = ACCESSORIES[accIdx % ACCESSORIES.length]

  // Layer 1: Draw Face shape
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if (face[y][x] === '#') {
        canvas[y][x] = true
      }
    }
  }

  // Layer 2: Draw Eyes (which can carve/erase or draw)
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if (eyes[y][x] === '#') {
        canvas[y][x] = true
      } else if (eyes[y][x] === '.') {
        canvas[y][x] = false
      }
    }
  }

  // Layer 3: Draw Mouth (which can carve or draw)
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if (mouth[y][x] === '#') {
        canvas[y][x] = true
      } else if (mouth[y][x] === '.') {
        canvas[y][x] = false
      }
    }
  }

  // Layer 4: Draw Hair / Hat (can carve or draw)
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if (hair[y][x] === '#') {
        canvas[y][x] = true
      } else if (hair[y][x] === '.') {
        canvas[y][x] = false
      }
    }
  }

  // Layer 5: Draw Accessories (can carve or draw)
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if (acc[y][x] === '#') {
        canvas[y][x] = true
      } else if (acc[y][x] === '.') {
        canvas[y][x] = false
      }
    }
  }

  return canvas
}

interface PixelAvatarProps {
  username: string
  size?: number
  className?: string
  customConfig?: {
    face: number
    eyes: number
    mouth: number
    hair: number
    acc: number
  }
}

export const PixelAvatar: React.FC<PixelAvatarProps> = ({ 
  username, 
  size = 28, 
  className = "", 
  customConfig 
}) => {
  // If customConfig is provided, use it. Otherwise, generate deterministically from username hash.
  const config = useMemo(() => {
    if (customConfig) return customConfig

    const name = username ? username.trim() : "guest"
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const seed = Math.abs(hash)
    return {
      face: seed % FACES.length,
      eyes: (seed >> 2) % EYES.length,
      mouth: (seed >> 4) % MOUTHS.length,
      hair: (seed >> 6) % HAIRS.length,
      acc: (seed >> 8) % ACCESSORIES.length
    }
  }, [username, customConfig])

  const matrix = useMemo(() => {
    return getPixelAvatarMatrix(
      config.face,
      config.eyes,
      config.mouth,
      config.hair,
      config.acc
    )
  }, [config])

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 12 12" 
      shapeRendering="crispEdges"
      className={`bg-slate-950 border border-slate-900 rounded-lg overflow-hidden shrink-0 ${className}`}
    >
      <title>{`Pixel Avatar for ${username || 'guest'}`}</title>
      {matrix.map((row, y) => {
        return row.map((pixel, x) => {
          if (pixel) {
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

// Cyberpunk Modal Component for Customizing the Avatar
interface AvatarCustomizerProps {
  username: string
  onClose: () => void
  currentConfig: {
    face: number
    eyes: number
    mouth: number
    hair: number
    acc: number
  }
  onSave: (config: {
    face: number
    eyes: number
    mouth: number
    hair: number
    acc: number
  }) => void
}

export const AvatarCustomizer: React.FC<AvatarCustomizerProps> = ({
  username,
  onClose,
  currentConfig,
  onSave
}) => {
  const [config, setConfig] = useState(currentConfig)

  const handleRandomize = () => {
    setConfig({
      face: Math.floor(Math.random() * FACES.length),
      eyes: Math.floor(Math.random() * EYES.length),
      mouth: Math.floor(Math.random() * MOUTHS.length),
      hair: Math.floor(Math.random() * HAIRS.length),
      acc: Math.floor(Math.random() * ACCESSORIES.length)
    })
  }

  const handleReset = () => {
    let hash = 0
    const name = username ? username.trim() : "guest"
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const seed = Math.abs(hash)
    setConfig({
      face: seed % FACES.length,
      eyes: (seed >> 2) % EYES.length,
      mouth: (seed >> 4) % MOUTHS.length,
      hair: (seed >> 6) % HAIRS.length,
      acc: (seed >> 8) % ACCESSORIES.length
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-tech text-slate-200">
      <div className="glass-panel glass-panel-glow-cyan max-w-md w-full rounded-2xl overflow-hidden p-6 flex flex-col gap-6 animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-900/60 pb-3">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white tracking-widest">// RETRO CHARACTER CREATOR</span>
            <span className="text-[9px] text-cyan-400 font-bold uppercase mt-0.5">Customize your identicon</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg transition-all"
          >
            &times;
          </button>
        </div>

        {/* Workspace */}
        <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-6 items-center">
          {/* Avatar Preview */}
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl flex items-center justify-center shadow-inner">
              <PixelAvatar username={username} size={100} customConfig={config} />
            </div>
            <button 
              onClick={handleRandomize}
              className="py-1 px-3 bg-cyan-950/20 hover:bg-cyan-500/10 border border-cyan-950 hover:border-cyan-500/30 text-cyan-400 rounded-lg text-[9px] font-bold transition-all w-full active:scale-95"
            >
              RANDOMIZE
            </button>
            <button 
              onClick={handleReset}
              className="text-[8px] text-slate-500 hover:text-slate-350 underline"
            >
              Reset to default
            </button>
          </div>

          {/* Sliders / Buttons controls */}
          <div className="flex flex-col gap-3.5 text-[9px] font-bold text-slate-400">
            {/* 1. Face */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span>[01] BASE FACE SHAPE</span>
                <span className="text-white">{config.face + 1} / {FACES.length}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max={FACES.length - 1} 
                value={config.face}
                onChange={(e) => setConfig({ ...config, face: parseInt(e.target.value) })}
                className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* 2. Hair */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span>[02] HAIR & HAT STYLE</span>
                <span className="text-white">{config.hair + 1} / {HAIRS.length}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max={HAIRS.length - 1} 
                value={config.hair}
                onChange={(e) => setConfig({ ...config, hair: parseInt(e.target.value) })}
                className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* 3. Eyes */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span>[03] EYEWEAR & EXPRESSION</span>
                <span className="text-white">{config.eyes + 1} / {EYES.length}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max={EYES.length - 1} 
                value={config.eyes}
                onChange={(e) => setConfig({ ...config, eyes: parseInt(e.target.value) })}
                className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* 4. Mouth */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span>[04] MOUTH, BEARD & MASK</span>
                <span className="text-white">{config.mouth + 1} / {MOUTHS.length}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max={MOUTHS.length - 1} 
                value={config.mouth}
                onChange={(e) => setConfig({ ...config, mouth: parseInt(e.target.value) })}
                className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* 5. Accessories */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span>[05] ACCESSORY OPTION</span>
                <span className="text-white">{config.acc + 1} / {ACCESSORIES.length}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max={ACCESSORIES.length - 1} 
                value={config.acc}
                onChange={(e) => setConfig({ ...config, acc: parseInt(e.target.value) })}
                className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-slate-900/60 pt-4">
          <button 
            onClick={onClose}
            className="py-2 px-4 bg-slate-950 hover:bg-slate-900 border border-slate-900 text-slate-400 rounded-xl text-[9px] font-bold transition-all active:scale-95"
          >
            CANCEL
          </button>
          <button 
            onClick={() => onSave(config)}
            className="py-2 px-5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-[9px] font-bold transition-all active:scale-95"
          >
            SAVE CHANGES
          </button>
        </div>
      </div>
    </div>
  )
}
