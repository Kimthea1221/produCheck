# from playwright.sync_api import sync_playwright

# def take_screenshot(url, output_path=None, wait_until="domcontentloaded", timeout=60000):
#     with sync_playwright() as playwright:
#         browser = playwright.chromium.launch()
#         page = browser.new_page()
#         page.goto(url, wait_until=wait_until, timeout=timeout)
#         screenshot = page.screenshot(path=output_path, type="png", full_page=True) if output_path else page.screenshot(type="png", full_page=True)
#         browser.close()
#         return screenshot


# if __name__ == "__main__":
#     output_file = "screenshot.png"
#     take_screenshot("https://example.com", output_path=output_file)
#     print(f"Screenshot successfully saved to {output_file}")