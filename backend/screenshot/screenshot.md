# Installing Playwright
1. Go to venv
2. pip install playwright
3. playwright install


# Code Explanation 
from playwright.sync_api import sync_playwright //import playwright

def take_screenshot(url, output_path=None, wait_until="domcontentloaded", timeout=60000): //define a screenshot function
    with sync_playwright() as playwright: //start playwright
        browser = playwright.chromium.launch() //launch chromium browser
        page = browser.new_page() //create a new page
        page.goto(url, wait_until=wait_until, timeout=timeout) //go to the url
        screenshot = page.screenshot(path=output_path, type="png", full_page=True) if output_path else page.screenshot(type="png", full_page=True) //take screenshot if output path is provided else take screenshot without output path
        browser.close() //close the browser
        return screenshot //return the screenshot


if __name__ == "__main__": //if the file is run as a script
    output_file = "screenshot.png" //set the output file name
    take_screenshot("https://example.com", output_path=output_file) //take screenshot of the url
    print(f"Screenshot successfully saved to {output_file}") //print the output file name


# To test run 
    inside backend venv
    1. python screenshot\screenshot.py

