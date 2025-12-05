export const createNewItem = () => ({
	id: "1",
	sk: new Date().toISOString(),
	val: Math.random() * 100,
});
