import { homedir } from 'os';
import chromeCookies from 'chrome-cookies-secure';
import puppeteer from 'puppeteer';

const userDataDir = `${homedir()}/Library/Application Support/Google/Chrome/Default`;

const cookies = await new Promise((res, rej) => {
    chromeCookies.getCookies(
        'https://www.netflix.com',
        'puppeteer',
        (err, cookies) => (err ? rej(err) : res(cookies)),
        'Default'
    );
});

const browser = await puppeteer.launch({
    headless: true,
    executablePath:
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir
});

const page = await browser.newPage();

await page.setCookie(...cookies);
await page.goto('https://www.netflix.com/browse');

const getAuthUrlHandler = (resolve) => async (res) => {
    if (res.request().postData()?.includes('authURL')) {
        return resolve(
            new URLSearchParams(res.request().postData()).get('authURL')
        );
    }
};

let authHandler;
const authUrl = await new Promise((resolve) => {
    authHandler = getAuthUrlHandler(resolve)
    page.on('response', authHandler);
});

page.off('response', authHandler);

const responseBody = await page.evaluate(async (authParam) => {
    const params = new URLSearchParams([
        ['path', `["mylist",["id","listId","name","requestId","trackIds"]]`],
        ['path', `["mylist",{"from":0,"to":1000},["itemSummary"]]`],
        ['authURL', authParam]
    ]);

    // Copied from network tab
    const response = await fetch(
        `https://www.netflix.com/nq/website/memberapi/v5a12e10c/pathEvaluator?webp=true&drmSystem=widevine&isVolatileBillboardsEnabled=true&routeAPIRequestsThroughFTL=false&isTop10Supported=true&hasVideoMerchInBob=true&hasVideoMerchInJaw=true&persoInfoDensity=false&infoDensityToggle=false&contextAwareImages=true&enableMultiLanguageCatalog=false&usePreviewModal=true&falcor_server=0.1.0&withSize=true&materialize=true&original_path=%2Fshakti%2Fv5a12e10c%2FpathEvaluator`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        }
    );

    return response.json();
}, authUrl);

const videos = Object.values(responseBody.jsonGraph.videos);

const movieSet = new Set();
const showSet = new Set();
const otherSet = new Set();
for (const video of videos) {
    const item = video.itemSummary.value;
    switch (item.type) {
        case 'movie':
            movieSet.add(item.title);
            break;
        case 'show':
            showSet.add(item.title);
            break;
        default:
            otherSet.add(item.title);
            break;
    }
}

if (movieSet.size) {
    console.log('Movies:\n');
    movieSet.forEach((movie) => console.log(movie));
}

if (showSet.size) {
    console.log('\n\nShows:\n');
    showSet.forEach((show) => console.log(show));
}

if (otherSet.size) {
    console.log('\n\nOther:\n');
    otherSet.forEach((other) => console.log(other));
}

await browser.close();
