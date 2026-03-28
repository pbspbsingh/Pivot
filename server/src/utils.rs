use reqwest::Client;
use std::sync::LazyLock;
use std::time::Duration;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

pub static CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .user_agent(USER_AGENT)
        .cookie_store(true)
        .timeout(Duration::from_secs(15))
        .connect_timeout(Duration::from_secs(5))
        .build()
        .expect("Failed to build HTTP client")
});
