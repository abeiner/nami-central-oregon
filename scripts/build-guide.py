"""Build the downloadable sponsorship guide from the website's program data."""

import argparse
import json
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "web" / "public"
DOWNLOADS = PUBLIC / "downloads"
WIDTH, HEIGHT = letter
MARGIN = 48
CONTENT = WIDTH - 2 * MARGIN
NAVY = HexColor("#132b48")
INK = HexColor("#20334b")
MUTED = HexColor("#465970")
PAPER = HexColor("#fbf7ee")
BLUE = HexColor("#e7eff7")
GOLD = HexColor("#f1cb78")
LINE = HexColor("#cad3d9")
SERIF = "Times-Roman"
SANS = "Helvetica"
BOLD = "Helvetica-Bold"


def amount(item):
    return f"${item['amount']:,}" + ("+" if item.get("plus") else "")


def clean(value):
    return value.replace("–", "-").replace("—", "-").replace("‑", "-")


class Guide:
    def __init__(self, output, data, site_url):
        self.pdf = canvas.Canvas(str(output), pagesize=letter, pageCompression=1, invariant=1)
        self.pdf.setTitle(f"{data['org']['name']} | Business Partnership Guide")
        self.pdf.setAuthor(data["org"]["name"])
        self.data = data
        self.site_url = site_url.rstrip("/")
        self.builder_url = self.site_url + "/partner"
        self.year = clean(data["org"]["programYear"])
        self.name = data["org"]["name"]
        self.cover_image = ImageReader(str(DOWNLOADS / "guide-cover.jpg"))

    def rect(self, x, y, width, height, color):
        self.pdf.setFillColor(color)
        self.pdf.rect(x, HEIGHT - y - height, width, height, fill=1, stroke=0)

    def rule(self, x, y, width, color=LINE):
        self.pdf.setStrokeColor(color)
        self.pdf.setLineWidth(0.65)
        self.pdf.line(x, HEIGHT - y, x + width, HEIGHT - y)

    def label(self, text, x, y, size=9, color=MUTED, tracking=1.15):
        self.pdf.saveState()
        line = self.pdf.beginText(x, HEIGHT - y)
        line.setFont(BOLD, size)
        line.setFillColor(color)
        line.setCharSpace(tracking)
        line.textOut(clean(text).upper())
        self.pdf.drawText(line)
        self.pdf.restoreState()
        return y + size

    def words(self, text, x, y, width, size=12, font=SANS, color=INK, leading=None):
        style = ParagraphStyle(
            "guide", fontName=font, fontSize=size, leading=leading or size * 1.28,
            textColor=color, splitLongWords=False
        )
        paragraph = Paragraph(escape(clean(text)), style)
        _, height = paragraph.wrap(width, HEIGHT)
        paragraph.drawOn(self.pdf, x, HEIGHT - y - height)
        return y + height

    def photograph(self, x, y, width, height):
        iw, ih = self.cover_image.getSize()
        scale = max(width / iw, height / ih)
        drawn_width, drawn_height = iw * scale, ih * scale
        bottom = HEIGHT - y - height
        self.pdf.saveState()
        path = self.pdf.beginPath()
        path.rect(x, bottom, width, height)
        self.pdf.clipPath(path, stroke=0, fill=0)
        self.pdf.drawImage(
            self.cover_image, x + (width - drawn_width) / 2, bottom + (height - drawn_height) / 2,
            drawn_width, drawn_height
        )
        self.pdf.restoreState()

    def button(self, text, x, y, url):
        width = stringWidth(text, BOLD, 11) + 36
        self.rect(x, y, width, 32, GOLD)
        self.words(text, x + 18, y + 8.5, width - 36 + 1, size=11, font=BOLD, color=NAVY)
        self.pdf.linkURL(url, (x, HEIGHT - y - 32, x + width, HEIGHT - y), relative=0)

    def footer(self, page, dark=False):
        color = BLUE if dark else MUTED
        self.rule(MARGIN, 748, CONTENT, color)
        self.label(self.name, MARGIN, 769, size=8, color=color, tracking=1)
        self.label(f"{self.year}  /  {page:02} of 05", WIDTH - MARGIN - 109, 769,
                   size=8, color=color, tracking=1)
        self.pdf.showPage()

    def heading(self, kicker, title, description):
        self.rect(0, 0, WIDTH, HEIGHT, PAPER)
        self.label(kicker, MARGIN, 53)
        y = self.words(title, MARGIN, 68, CONTENT, size=42, font=SERIF, color=NAVY, leading=43)
        return self.words(description, MARGIN, y + 12, CONTENT, size=12.5, color=MUTED) + 23

    def cover(self):
        self.rect(0, 0, WIDTH, HEIGHT, NAVY)
        self.label(self.name, MARGIN, 51, size=11, color=GOLD)
        self.label(f"Business partnership guide  /  {self.year}", MARGIN, 82, size=9, color=BLUE)
        self.words("Keep mental health support free.", MARGIN, 99, 475,
                   size=59, leading=59, font=SERIF, color=white)
        self.words("Local businesses help make free support groups, classes and a clearer path to care possible across Central Oregon.",
                   MARGIN, 236, 469, size=15, color=BLUE)
        self.photograph(0, 303, WIDTH, 270)
        for index, stat in enumerate(self.data["stats"]):
            x = MARGIN + index * (CONTENT / 4)
            value = f"{stat['value']:,}{stat.get('suffix', '')}"
            self.words(value, x, 617, 120, size=32, font=SERIF, color=GOLD)
            self.words(stat["label"], x, 663, 112, size=10, color=BLUE)
        area = self.data["org"]["serviceArea"]
        self.words("Serving " + ", ".join(area[:-1]) + " and the " + area[-1] + ".",
                   MARGIN, 710, CONTENT, size=9.5, color=BLUE)
        self.footer(1, dark=True)

    def annual(self):
        y = self.heading(
            "Annual corporate partnerships", "Support the whole mission",
            "Choose one annual level. Each level adds to the benefits from the one below it."
        )
        tiers = {tier["id"]: tier for tier in self.data["tiers"]}
        for tier in tiers.values():
            self.rule(MARGIN, y, CONTENT)
            self.words(tier["name"], MARGIN, y + 14, 172, size=20, font=SERIF, color=NAVY)
            self.words(amount(tier) + " / year", MARGIN, y + 41, 172, size=11, font=BOLD)
            if tier.get("inquiryOnly"):
                self.words("Starts with a conversation", MARGIN, y + 59, 172, size=9, color=MUTED)
            right = MARGIN + 189
            line = y + 13
            if tier.get("includes"):
                inherited = tiers[tier["includes"]]["name"]
                line = self.words(f"Includes {inherited} benefits, plus", right, line, CONTENT - 189,
                                  size=9.7, font=BOLD, color=MUTED) + 4
            for benefit in tier["benefits"]:
                self.pdf.setFillColor(MUTED)
                self.pdf.circle(right + 2, HEIGHT - line - 6.7, 1.25, fill=1, stroke=0)
                line = self.words(benefit["label"], right + 12, line, CONTENT - 201,
                                  size=11, leading=13.6) + 3
            y = max(y + 86, line + 12)
        self.rule(MARGIN, y, CONTENT)
        self.words("Add a project or NAMIWalks to your annual partnership in the same sponsorship request.",
                   MARGIN, y + 16, CONTENT, size=11.5, color=MUTED)
        self.footer(2)

    def resource_guide(self):
        project = next(item for item in self.data["projects"] if item["id"] == "resource-guide")
        y = self.heading("Launching first", "Put answers within reach", project["description"])
        self.photograph(MARGIN, y, CONTENT, 225)
        y += 247
        for level in project["levels"]:
            self.rule(MARGIN, y, CONTENT)
            self.words(level["name"], MARGIN, y + 10, 205, size=18, font=SERIF, color=NAVY)
            line = self.words(amount(level), MARGIN, y + 33, 205, size=11, font=BOLD)
            if "limit" in level:
                slots = "placement" if level["limit"] == 1 else "placements"
                self.words(f"{level['limit']} {slots}", MARGIN + 61, y + 33, 140, size=10, color=MUTED)
            for benefit in level["benefits"]:
                line = max(line, self.words(benefit["label"], MARGIN + 211, y + 13, CONTENT - 211,
                                            size=11.5))
            y = max(y + 56, line + 10)
        self.rule(MARGIN, y, CONTENT)
        self.button("Explore Resource Guide sponsorship", MARGIN, y + 17, self.builder_url)
        self.footer(3)

    def projects(self):
        y = self.heading("Projects and events", "Choose the work you back",
                         "Sponsor one project, combine several, or add a project to your annual partnership.")
        projects = [
            p for p in self.data["projects"] if p["id"] != "resource-guide" and p["kind"] == "project"
        ]
        gap = 22
        column = (CONTENT - gap) / 2
        for row in range(0, len(projects), 2):
            bottoms = []
            for offset, project in enumerate(projects[row:row + 2]):
                x = MARGIN + offset * (column + gap)
                self.rule(x, y, column)
                bottom = self.words(project["name"], x, y + 9, column, size=18, font=SERIF, color=NAVY,
                                    leading=19)
                for level in project["levels"]:
                    availability = ""
                    if "limit" in level:
                        slots = "placement" if level["limit"] == 1 else "placements"
                        availability = f" · {level['limit']} {slots}"
                    price = f"{level['name']} · {amount(level)}{availability}"
                    bottom = self.words(price, x, bottom + 7, column, size=9.3, font=BOLD)
                    for benefit in level["benefits"]:
                        bottom = self.words(benefit["label"], x, bottom + 3, column, size=10.5,
                                            leading=13)
                bottoms.append(bottom)
            y = max(bottoms) + 20
        walk = next(p for p in self.data["projects"] if p["kind"] == "namiwalks")
        self.rect(MARGIN, y, CONTENT, 137, BLUE)
        x = MARGIN + 17
        line = self.words(walk["name"], x, y + 11, CONTENT - 34, size=21, font=SERIF, color=NAVY)
        date = walk["kicker"].replace("Next walk:", "Proposed walk date:")
        line = self.words(date, x, line + 3, CONTENT - 34, size=9.5, color=MUTED)
        line = self.words("  /  ".join(amount(level) for level in walk["levels"]),
                          x, line + 5, CONTENT - 34, size=10.5, font=BOLD)
        self.words(walk["description"] + " Confirm the date and recognition with the walk organizer.",
                   x, line + 5, CONTENT - 34, size=10.3, leading=13)
        self.footer(4)

    def qr(self, url, x, y, size):
        qr = QrCodeWidget(url, barFillColor=NAVY)
        x0, y0, x1, y1 = qr.getBounds()
        drawing = Drawing(size, size, transform=[size / (x1 - x0), 0, 0, size / (y1 - y0), 0, 0])
        drawing.add(qr)
        renderPDF.draw(drawing, self.pdf, x, HEIGHT - y - size)
        self.pdf.linkURL(url, (x, HEIGHT - y - size, x + size, HEIGHT - y), relative=0)

    def start(self):
        y = self.heading("From interest to impact", "Become a partner",
                         "Choose what you want to support and tell us how you’d like to be recognized.")
        steps = [
            ("Choose your support", "Select an annual level, a project, NAMIWalks or a combination. "
             "Select the custom option to start a conversation with our Regional Director."),
            ("Sign your commitment", "Share your business contact, website, logo, short description and recognition preferences for review."),
            ("Arrange payment", "Your invoice is available after you sign a standard commitment. "
             f"Terms are {self.data['payment']['terms'].lower()}. Arrange payment privately with our Regional Director. "
             "We’ll confirm your recognition schedule after payment."),
        ]
        for index, (title, body) in enumerate(steps, start=1):
            self.rule(MARGIN, y, CONTENT)
            self.words(f"0{index}", MARGIN, y + 8, 37, size=22, font=SERIF, color=MUTED)
            x = MARGIN + 49
            line = self.words(title, x, y + 10, CONTENT - 49, size=17, font=SERIF)
            y = self.words(body, x, line + 3, CONTENT - 49, size=10.8, leading=13.8) + 12
        self.rule(MARGIN, y, CONTENT)
        y += 17
        champions = self.data["champions"]
        y = self.words(champions["title"], MARGIN, y, CONTENT, size=23, font=SERIF, color=NAVY)
        y = self.words("Any business can earn recognition through participation. " + " ".join(
            action.rstrip(".") + "." for action in champions["actions"]
        ), MARGIN, y + 5, CONTENT, size=10.8, leading=13.8)
        y = self.words(champions["disclaimer"], MARGIN, y + 6, CONTENT, size=9.25, color=MUTED) + 15
        self.rect(MARGIN, y, CONTENT, 103, NAVY)
        self.rect(WIDTH - MARGIN - 85, y + 13, 76, 76, white)
        self.qr(self.builder_url, WIDTH - MARGIN - 84, y + 14, 74)
        self.label("Business partnerships", MARGIN + 15, y + 23, size=8, color=BLUE)
        self.button("Open the partnership builder", MARGIN + 15, y + 33, self.builder_url)
        self.words(self.builder_url, MARGIN + 15, y + 75, CONTENT - 116, size=8.2, color=BLUE)
        y += 115
        email = self.data["org"]["email"]
        if email and not re.search(r"@example\.(com|org|net)$", email):
            self.words(f"Questions? {email}", MARGIN, y, CONTENT, size=9.7, color=MUTED)
            self.pdf.linkURL(f"mailto:{email}", (MARGIN, HEIGHT - y - 13, MARGIN + 320, HEIGHT - y), relative=0)
        self.footer(5)

    def build(self):
        self.cover()
        self.annual()
        self.resource_guide()
        self.projects()
        self.start()
        self.pdf.save()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-url", default="https://red-mushroom-0bde5a81e.3.azurestaticapps.net")
    args = parser.parse_args()
    with (PUBLIC / "content.json").open(encoding="utf-8-sig") as source:
        data = json.load(source)
    Guide(DOWNLOADS / "sponsor-guide.pdf", data, args.site_url).build()


if __name__ == "__main__":
    main()
