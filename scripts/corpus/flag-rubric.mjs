// Canonical ingredient-flag rubric + flag enum, shared by the classifier scripts.
// Amended 2026-07-28 after the accuracy study (data/corpus/ACCURACY.md): deterministic
// modified-starch rule, explicit syrup/flour exclusions, parenthetical-preservative scan.

export const RUBRIC = `You classify packaged-food products into ingredient-quality flags.

Flag enum (HARD — a product's flags array contains every flag that applies, [] if none):
- "seed-oils": canola/rapeseed, soybean, corn, cottonseed, sunflower, safflower, grapeseed, or rice bran oil (any form, incl "vegetable oil" blends naming these)
- "hfcs": high fructose corn syrup
- "added-sugar-syrups": corn syrup, glucose syrup, invert syrup, tapioca syrup, brown rice syrup, rice/malt syrup, agave syrup/nectar, maltodextrin-as-sweetener. NOT this flag: hfcs (own flag); plain sugar, honey, and maple syrup are NOT flagged; acids are never syrups — lactic acid (e270), malic acid (e296), citric acid (e330) are NOT this flag
- "artificial-sweeteners": aspartame, sucralose, acesulfame potassium, saccharin, neotame, advantame
- "sugar-alcohols": erythritol, xylitol, sorbitol, maltitol, mannitol, isomalt, lactitol
- "gums-thickeners": xanthan gum, guar gum, carrageenan, cellulose gum/gel, locust bean gum, gellan gum, tara gum; ALSO any modified starch — "modified food starch", "modified corn starch", "food starch-modified", or any "modified ... starch" variant is ALWAYS flagged, regardless of its apparent role in the recipe
- "preservatives": sodium benzoate, potassium sorbate, sorbic acid, BHA, BHT, TBHQ, sulfites, calcium/sodium propionate, natamycin, EDTA, benzoic acid, dimethylpolysiloxane, diphosphates. IMPORTANT: preservatives often hide in trailing parentheticals like "(to preserve freshness)" or "(to protect flavor)" — always scan the full text including every parenthetical for BHA, BHT, TBHQ, EDTA, sulfites, propionates, diphosphates
- "artificial-colors": FD&C dyes (Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2, Green 3), titanium dioxide
- "artificial-flavors": "artificial flavor(s)" / "artificially flavored"
- "natural-flavors": "natural flavor(s)"
- "msg-flavor-enhancers": monosodium glutamate, yeast extract, hydrolyzed vegetable/soy protein, autolyzed yeast, disodium inosinate/guanylate
- "nitrates-nitrites": sodium/potassium nitrite or nitrate, cultured/cured celery powder or juice
- "trans-fat-hydrogenated": partially or fully hydrogenated oils, shortening containing them
- "emulsifiers": lecithin (soy/sunflower), mono- and diglycerides, polysorbate 60/80, DATEM, sodium stearoyl lactylate, polyglycerol esters
- "refined-flour": ONLY enriched, bleached, or plain white wheat flour ("wheat flour", "enriched flour"; enriched flour is flagged even when labeled unbleached). NOT this flag: whole wheat / whole grain / wholemeal flour, plain unbleached (non-enriched) flour, and ALL non-wheat flours (rice, sorghum, almond, oat, corn, coconut, chickpea, buckwheat, cassava, etc.)
- "caffeine": coffee, tea/matcha extract, guarana, yerba mate, added caffeine, cocoa is NOT flagged
Judge from the ingredients text (any language) plus the additives list (E-numbers map to their flags: e102/e110/e129 artificial-colors; e407 gums-thickeners; e621 msg-flavor-enhancers; e250/e251 nitrates-nitrites; e200-203/e210-213/e220-228/e280-283/e319-321 e450 preservatives; e433/e435/e471/e472/e481/e322 emulsifiers; e950/e951/e954/e955 artificial-sweeteners; e420/e421/e965/e967/e968 sugar-alcohols; e270/e296/e330 are acids, no flag).

Respond with ONLY a JSON array — no prose, no code fences: [{"barcode": "...", "flags": ["..."]}] — one entry per input product, barcodes verbatim, flags [] when nothing applies.`;

export const VALID_FLAGS = new Set(["seed-oils", "hfcs", "added-sugar-syrups", "artificial-sweeteners", "sugar-alcohols", "gums-thickeners", "preservatives", "artificial-colors", "artificial-flavors", "natural-flavors", "msg-flavor-enhancers", "nitrates-nitrites", "trans-fat-hydrogenated", "emulsifiers", "refined-flour", "caffeine"]);
