from html_sanitizer import Sanitizer


def run_html_sanitizer(html: str, action_type: str):
    def sanitize_html(html: str, config: dict) -> str:
        sanitizer = Sanitizer(config)
        return sanitizer.sanitize(html)

    config = {}
    if action_type == "task-finish":
        allowed_tags = [
            'a', 'address', 'article', 'aside', 'b', 'blockquote', 'button', 'caption', 'cite', 'code', 'col', 'colgroup', 
			'data', 'datalist', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 
			'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 
			'h5', 'h6', 'header', 'hr', 'i', 'img', 'input', 'label', 'legend', 
			'li', 'main', 'menu', 'nav', 'ol', 'option', 'output', 'p', 'pre', 
			'q', 's', 'section', 'select', 'small', 'span', 'strong', 'sub', 'summary',
			'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'textarea', 'time', 'tr', 'ul', 'video',
			'title'
        ]

        common_attrs = ["id", "aria-label", "role"]
        wildcard_data_attrs = "data-*"

        # Start with tag-specific attributes
        attributes = {
            "a": ["rel", "target"] + common_attrs,
            "img": ["alt"] + common_attrs,
            "button": ["aria-label"] + common_attrs,
        }

        # Add the common attributes to all other tags
        for tag in allowed_tags:
            if tag not in attributes:
                attributes[tag] = common_attrs.copy()
            # Add wildcard attributes for data-* only if supported by your sanitizer config
            attributes[tag].append(wildcard_data_attrs)

        config = {
            "tags": allowed_tags,
            "attributes": attributes,
            "empty": ["a", "img"],
            "separate": ["p", "div", "h1", "h2", "h3", "article", "main"],
            "keep_typographic_whitespace": True
        }

    return sanitize_html(html, config)