use pulldown_cmark::{Options, Parser, html};

pub fn render(content: &str) -> String {
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TASKLISTS);
    opts.insert(Options::ENABLE_FOOTNOTES);
    let parser = Parser::new_ext(content, opts);
    let mut output = String::new();
    html::push_html(&mut output, parser);
    output
}
