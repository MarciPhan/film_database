import asyncio
from api import CSFDScraper

async def test():
    print("Searching for 'Stranger Things'...")
    results = await CSFDScraper.search("Stranger Things")
    for r in results:
        print(f"- {r['title']} ({r['year']}): {r['url']}")
    
    if results:
        print("\nFetching details for the first result...")
        details = await CSFDScraper.get_details(results[0]['url'])
        print(f"Title: {details['title']}")
        print(f"Rating: {details['rating']}")
        print(f"Genres: {details['genres']}")
        print(f"Episodes: {len(details['episodes'])}")

if __name__ == "__main__":
    asyncio.run(test())
