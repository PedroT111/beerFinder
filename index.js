const puppeteer = require('puppeteer');
//const numeral = require('numeral');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start|\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '¡Hola! Soy un bot que te proporcionará información sobre los precios de las cervezas en diferentes supermercados. Utiliza /cerveza seguido de una marca (utilia el nombre completo) para buscar precios. Por ejemplo: /cerveza stella artois');
});

bot.onText(/\/cerveza (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const beerBrand = match[1];
    bot.sendMessage(chatId, `Buscando precios para la cerveza ${beerBrand} en diferentes supermercados...`);

    try {
        const beerData = await scrapeByBeer(beerBrand);
        let message = '';
        const isEmpty = beerData.every(store => store.data.length === 0);

        if (isEmpty) {
            bot.sendMessage(chatId, `No se encontraron cervezas de la marca ${beerBrand}.`);
            return;
        }
        for (const market in beerData) {
            const formattedStoreData = formatBeers(beerData[market]);
            if(beerData[market].data.length === 0){
                message+= `${beerData[market].siteName.toUpperCase()}:\n\nNo se encontraron cervezas de esa marca\n\n`;
            } else {
                message += `${beerData[market].siteName.toUpperCase()}:\n\n${formattedStoreData}\n\n`;
            }
           
        }
        bot.sendMessage(chatId, message);
    } catch (error) {
        console.error('Error al buscar cerveza:', error);
        bot.sendMessage(chatId, 'Ocurrió un error al buscar la cerveza. Por favor, intenta nuevamente más tarde.');
    }
});
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (!msg.text.startsWith('/cerveza') && !msg.text.startsWith('/start')) {
        bot.sendMessage(
            chatId,
            'Utiliza /cerveza seguido de una marca para buscar precios. Por ejemplo: /cerveza stella artois'
        );
    }

});
function formatBeers(beersData) {
    return beersData.data.map(beer => {
        if (beer.pricePerLiter === null) {
            return `${beer.name.toLowerCase()}\nPrecio: ${beer.price}`;
        }
        return `${beer.name.toLowerCase()}\nPrecio: ${beer.price}\nPrecio por Litro: $${beer.pricePerLiter}`;
    }).join('\n\n');
}

async function scrollPageToBottom(page) {
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            let totalHeight = 0;
            const distance = 100;

            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

/*function extractPackSize(name) {
    const regex = /\b((pack\s*(\d+))|((\d+)\s*u)|((\d+)\s*x\s*(\d+)\s*u)|((\d+)\s*x\s*(\d+))|((\d+)\s*latas?\s*(\d+)?))\b|\b(\d+)\s+un|\b(\d+)(?![\d\s]*(?:cc|ml|u|un|latas?))|x\s*(\d+)\b/i;
    const match = name.match(regex);

    if (!match) {
        return null;
    }

    if (match && match.length > 1) {
        for (let i = 1; i < match.length; i++) {
            if (match[i] && !isNaN(parseInt(match[i])) && match[i] > 3 && match[i] < 15) {
                return parseInt(match[i]);
            }
        }
    }

    return null;
}

function convertToLiters(name) {
    const regex = /(\d+)\s*(cc|ml|l)/i;
    const match = name.match(regex);

    if (!match) {
        return null;
    }
    const [, value, unit] = match;
    const numericValue = numeral(value).value();

    if (unit.toLowerCase() === 'cc' || unit.toLowerCase() === 'ml') {
        return numericValue / 1000;
    } else if (unit.toLowerCase() === 'l') {
        return numericValue;
    }

    return null;
}
function calculatePricePerLiter(price, name, packsize) {
    const liters = convertToLiters(name);

    if (liters != null) {
        const numericPrice = cleanPrice(price);
        if (packsize != null) {
            return ((numericPrice / liters) / packsize).toFixed(2);
        }
        return (numericPrice / liters).toFixed(2);
    }

    return 'Error al calcular precio por litro'
}*/
function cleanPrice(input) {
    const cleanedInput = input.replace(/[^\d.,]/g, '');
    const decimalIndex = cleanedInput.indexOf(',') !== -1 ? cleanedInput.indexOf(',') : cleanedInput.indexOf('.'); // Encontrar el índice del separador decimal

    if (decimalIndex !== -1) {
        const integerPart = cleanedInput.substring(0, decimalIndex);
        return integerPart.replace(/\D/g, '');
    }
    return cleanedInput;
}


function sortByPrice(beers) {
    const sortedBeerData = beers.sort((a, b) => {
        return parseFloat(a.pricePerLiter) - parseFloat(b.pricePerLiter);
    });

    return sortedBeerData;
}

async function scrapeBeerData(page, selector, priceSelector, containerSelector, literPriceSelector) {
    await page.addScriptTag({ path: require.resolve('numeral') });
    const functions = `
        ${sortByPrice}
        ${cleanPrice}
    `;

    const beerData = await page.evaluate((selector, priceSelector, containerSelector, literPriceSelector, functions) => {
        eval(functions);
        const beers = [];
        const beerElements = document.querySelectorAll(selector);
        beerElements.forEach(beerElement => {
            const beerName = beerElement.textContent.trim();
            const priceElement = beerElement.closest(containerSelector).querySelector(priceSelector);
            const beerPrice = priceElement ? priceElement.textContent.trim() : 'Precio no encontrado';
            //const packsize = extractPackSize(beerName);
            const priceLiterElement = beerElement.closest(containerSelector).querySelector(literPriceSelector);
            const literPrice = priceLiterElement ? cleanPrice(priceLiterElement.textContent.trim()) : null;
            const containsCerveza = beerName.toLowerCase().includes('cerveza');

            if (containsCerveza) {
                beers.push({ name: beerName, price: beerPrice, pricePerLiter: literPrice });
            }


        });
        const sorted = sortByPrice(beers);
        return sorted;
    }, selector, priceSelector, containerSelector, literPriceSelector, functions);


    return beerData;
}

async function scrapeByBeer(beer) {
    const browser = await puppeteer.launch({ headless: "new" });
    const promises = [];

    const sites = [
        {
            name: "Disco",
            url: `https://www.disco.com.ar/Bebidas/Cervezas?initialMap=c,c&initialQuery=bebidas/cervezas&map=category-1,category-2,brand&query=/bebidas/cervezas/${beer.toLowerCase()}&searchState`,
            selector: '.vtex-product-summary-2-x-productBrand',
            containerSelector: '.vtex-product-summary-2-x-container',
            priceSelector: '.contenedor-precio span',
            literPriceSelector: 'ab'
        },
        {
            name: "ChangoMas",
            url: `https://www.masonline.com.ar/cervezas?initialMap=c&initialQuery=cervezas&map=category-1,brand&query=/cervezas/${beer.toLowerCase()}&searchState`,
            selector: '.vtex-product-summary-2-x-productBrand',
            containerSelector: '.vtex-product-summary-2-x-container',
            priceSelector: '.valtech-gdn-dynamic-product-0-x-dynamicProductPrice',
            literPriceSelector: '.valtech-gdn-dynamic-weight-price-0-x-currencyContainer'
        },
        {
            name: "Super Mami",
            url: `https://www.dinoonline.com.ar/super/categoria?_dyncharset=utf-8&Dy=1&Nty=1&minAutoSuggestInputLength=3&autoSuggestServiceUrl=%2Fassembler%3FassemblerContentCollection%3D%2Fcontent%2FShared%2FAuto-Suggest+Panels%26format%3Djson&searchUrl=%2Fsuper&containerClass=search_rubricator&defaultImage=%2Fimages%2Fno_image_auto_suggest.png&rightNowEnabled=false&Ntt=${beer.toLowerCase()}`,
            selector: '.description',
            containerSelector: '.product',
            priceSelector: '.precio-unidad span',
            literPriceSelector: '.precio-referencia'
        },
        {
            name: "Carrefour",
            url: `https://www.carrefour.com.ar/Bebidas/Cervezas?initialMap=c,c&initialQuery=bebidas/cervezas&map=category-1,category-2,brand&query=/bebidas/cervezas/${beer.toLowerCase()}&searchState`,
            selector: '.vtex-product-summary-2-x-productBrand',
            containerSelector: '.vtex-product-summary-2-x-container',
            priceSelector: '.valtech-carrefourar-product-price-0-x-sellingPriceValue',
            literPriceSelector: '.valtech-carrefourar-dynamic-weight-price-0-x-currencyContainer'
        }
    ];

    for (const site of sites) {
        promises.push(
            (async () => {
                try {
                    const page = await browser.newPage();
                    await page.goto(site.url, { waitUntil: 'networkidle0', timeout: 60000 });
                    await scrollPageToBottom(page);
                    const data = await scrapeBeerData(page, site.selector, site.priceSelector, site.containerSelector, site.literPriceSelector);
                    return { siteName: site.name, data };
                } catch (error) {
                    console.error(`Error al scrapear ${site.name}:`, error);
                    return { siteName: site.name, error: true };
                }
            })()
        );
    }

    const results = await Promise.all(promises);

    await browser.close();
    return results;
}

