terraform {
  required_version = ">= 1.16.5"

  backend "s3" {
    bucket                      = "metadata-scrubber-terraform-state"
    key                         = "terraform.tfstate"
    region                      = "auto"
    use_lockfile                = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "= 5.27.0"
    }
  }
}

provider "cloudflare" {}

variable "cloudflare_account_id" {
  description = "The Cloudflare account ID that owns the R2 bucket."
  type        = string
}

# Provider 5.27.0 cannot import CORS. Its create operation writes the full rule.
resource "cloudflare_r2_bucket_cors" "production" {
  account_id  = var.cloudflare_account_id
  bucket_name = "metadata-scrubber-prod"
  rules = [{
    allowed = {
      origins = [
        "https://www.metadata-scrubber.com",
        "https://metadata-scrubber.bmendoza-shak19.workers.dev",
      ]
      methods = ["PUT", "GET"]
      headers = ["Content-Type"]
    }
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }]
}
