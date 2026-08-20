# Page fixtures

The extractor's page fixtures are saved copies of third-party recipe and video pages
(Budget Bytes, NYT Cooking, Smitten Kitchen, TikTok, YouTube and others). They are not
committed to this public repository, because redistributing a verbatim copy of someone
else's page is a copyright and terms-of-service question this repo has no need to own.

The four extractor test files that read them skip themselves when the fixtures are
absent, so `npx vitest run` is green on a fresh clone. Every other suite runs.

To restore them locally, save each page as HTML into this directory under the names the
tests reference:

```
budgetbytes-chili.html      loveandlemons-bbq.html      nytcooking-saag.html
recipetineats-butterchicken.html  sallys-cookies.html   smittenkitchen-noodles.html
tiktok-linkinbio.html       tiktok-pbcups.html          tiktok-petvideo.html
youtube-misopasta.html      youtube-pushday.html        blocked-page.html
```
